import kotlin.math.abs
import groovy.json.JsonOutput

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
val bundledUiRoot = layout.buildDirectory.dir("generated/picgiftAssets")
val syncBundledUi by tasks.registering(Sync::class) {
    // Explicit public allowlist: backend, signing files, tests and dependencies never enter the APK.
    from(rootDir.parentFile) {
        include("*.html", "*.js", "*.css", "scenes.json", "manifest.webmanifest")
        include("assets/**", "locales/**", "vendor/**")
    }
    into(bundledUiRoot.map { it.dir("app") })
    doLast {
        check(file("${destinationDir}/index.html").isFile) { "Bundled PICGIFT index.html is missing" }
        val files = destinationDir.walkTopDown().filter { it.isFile && it.name != "bundle-manifest.json" }
            .map { it.relativeTo(destinationDir).invariantSeparatorsPath }.sorted().toList()
        file("${destinationDir}/bundle-manifest.json").writeText(JsonOutput.toJson(mapOf("bundled" to true, "files" to files)))
    }
}
android {
    namespace = "com.picgift.myapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.picgift.myapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 18
        versionName = "1.8.9-beta"
    }
    buildFeatures { buildConfig = true }
    sourceSets.getByName("main").assets.srcDir(bundledUiRoot)
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
    implementation("com.google.android.play:app-update:2.1.0")
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
        for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) {
            val color = bitmap.getRGB(x, y)
            val red = (color shr 16) and 255
            val green = (color shr 8) and 255
            // Measure the recognizable gold/orange logo, excluding its dark background.
            if (red > 85 && red > green * 1.15) {
                minX = minOf(minX, x)
                maxX = maxOf(maxX, x)
            }
        }
        val coverage = (maxX - minX + 1).toDouble() / bitmap.width * scale
        // Android masks a 72dp tile from its 108dp foreground canvas.
        // Background decorations may meet the mask; do not shrink the whole tile into a circle.
        val visibleCoverage = coverage / (72.0 / 108)
        check(visibleCoverage in 0.88..1.02) { "PICGIFT official tile must fill the launcher mask without excessive black margins" }
        check(abs(inset - 1.0 / 6) < 0.001) { "Official launcher inset must match the 72dp tile" }
        println("PICGIFT launcher verified: ${(visibleCoverage * 100).toInt()}% visible tile coverage")
    }
}
tasks.named("preBuild") { dependsOn(verifyLauncherIcon, syncBundledUi) }
