plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
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
        versionCode = 10
        versionName = "1.9.0-compose-gallery-crop-preview"
    }
    buildFeatures { buildConfig = true; compose = true }
    defaultConfig {
        buildConfigField("boolean", "PICGIFT_FIREBASE_CONFIGURED", firebaseConfigPresent.toString())
        buildConfigField("String", "PICGIFT_GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }
    val uploadStore = System.getenv("PICGIFT_UPLOAD_STORE")
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
    implementation(platform("androidx.compose:compose-bom:2025.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.android.billingclient:billing:9.1.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
}
