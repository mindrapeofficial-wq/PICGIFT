import kotlin.math.hypot

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// Include Google Services only when the matching Firebase Android config is supplied.
val firebaseConfigPresent = file("google-services.json").isFile
// Public OAuth WEB client ID, never a client secret. It must also be authorized in Supabase.
val googleWebClientId = System.getenv("PICGIFT_GOOGLE_WEB_CLIENT_ID").orEmpty().trim()
check(googleWebClientId.isEmpty() ||
    Regex("^[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$").matches(googleWebClientId)) {
    "PICGIFT_GOOGLE_WEB_CLIENT_ID must be a valid Google OAuth web client ID"
}
if (firebaseConfigPresent) apply(plugin = "com.google.gms.google-services")
android {
    namespace = "com.picgift.myapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.picgift.myapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 12
        versionName = "1.8.3-beta"
    }
    buildFeatures { buildConfig = true }
    defaultConfig {
        buildConfigField("boolean", "PICGIFT_FIREBASE_CONFIGURED", firebaseConfigPresent.toString())
        buildConfigField("String", "PICGIFT_GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }
    val uploadStore = System.getenv("PICGIFT_UPLOAD_STORE")
    if (!uploadStore.isNullOrBlank() && googleWebClientId.isBlank()) {
        throw GradleException("Google OAuth web client ID is required for signed PICGIFT releases.")
    }
    if (!uploadStore.isNullOrBlank() && !firebaseConfigPresent) {
        throw GradleException("Firebase Android configuration is required for signed PICGIFT releases.")
    }
    signingConfigs {
        if (!uploadStore.isNullOrBlank()) create("upload") {
            storeFile = file(uploadStore)
            storePassword = System.getenv("PICGIFT_UPLOAD_STORE_PASSWORD")
            keyAlias = System.getenv("PICGIFT_UPLOAD_KEY_ALIAS")
            keyPassword = System.getenv("PICGIFT_UPLOAD_KEY_PASSWORD")
        }
    }
    buildTypes { release {
        isMinifyEnabled = true
        isShrinkResources = true
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        if (!uploadStore.isNullOrBlank()) signingConfig = signingConfigs.getByName("upload")
    } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("com.android.billingclient:billing:9.1.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
}

// Validate the rendered art, rather than only checking the PNG canvas size.
val verifyLauncherIcon by tasks.registering {
    val artwork = file("src/main/res/drawable-nodpi/ic_launcher_official.png")
    val adaptive = file("src/main/res/mipmap-anydpi-v26/ic_launcher.xml")
    inputs.files(artwork, adaptive)
    doLast {
        val bitmap = javax.imageio.ImageIO.read(artwork)
            ?: throw GradleException("Cannot read the PICGIFT launcher artwork")
        check(bitmap.width == 512 && bitmap.height == 512) { "Launcher artwork must be 512 × 512" }
        val inset = Regex("android:inset=\"(-?[0-9.]+)%\"").find(adaptive.readText())
            ?.groupValues?.get(1)?.toDouble()?.div(100)
            ?: throw GradleException("Launcher inset must be an explicit percentage")
        val scale = 1 - 2 * inset
        var minX = bitmap.width
        var maxX = -1
        var radius = 0.0
        for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) {
            val color = bitmap.getRGB(x, y)
            val red = (color shr 16) and 255
            val green = (color shr 8) and 255
            // Measure the recognizable gold/orange logo, excluding its dark background.
            if (red > 85 && red > green * 1.15) {
                minX = minOf(minX, x)
                maxX = maxOf(maxX, x)
                radius = maxOf(radius, hypot(
                    (x - (bitmap.width - 1) / 2.0) / bitmap.width,
                    (y - (bitmap.height - 1) / 2.0) / bitmap.height
                ) * scale)
            }
        }
        val coverage = (maxX - minX + 1).toDouble() / bitmap.width * scale
        check(coverage >= 0.50) { "PICGIFT launcher logo is too small: ${(coverage * 100).toInt()}% coverage. Check source padding and adaptive inset." }
        check(radius <= 66.0 / 216) { "PICGIFT launcher logo exceeds the 66dp adaptive safe circle and may be cropped." }
        println("PICGIFT launcher verified: ${(coverage * 100).toInt()}% foreground coverage; safe circle preserved")
    }
}
tasks.named("preBuild") { dependsOn(verifyLauncherIcon) }
