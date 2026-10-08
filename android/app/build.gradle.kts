plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.picgift.myapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.picgift.myapp"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
    }
    buildFeatures { buildConfig = true }
    val uploadStore = System.getenv("PICGIFT_UPLOAD_STORE")
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
}
