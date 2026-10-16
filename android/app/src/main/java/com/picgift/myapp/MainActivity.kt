package com.picgift.myapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.content.ClipData
import android.provider.MediaStore
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import android.os.Build
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.Purchase
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.QueryProductDetailsParams
import org.json.JSONObject
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var billing: BillingClient
    private var currentAccount: String? = null
    private var billingFlowAccount: String? = null
    private var billingConnecting = false
    private var pageReady = false
    private var nativeBottomInsetDp = 0f
    private val googleSignIn by lazy { GoogleCredentialSignIn(this, ::deliverGoogleToken, ::googleSignInError) }
    private val nativePush by lazy {
        NativePushController(this) { detail ->
            if (::web.isInitialized && trustedPicgiftPage())
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('picgift:native-push',{detail:$detail}));", null)
        }
    }
    private lateinit var loading: ProgressBar
    private lateinit var failure: LinearLayout
    private lateinit var requiredUpdate: RequiredUpdateGate
    private val homeUrl get() = "https://picgift.onrender.com/app/index.html?device_lang=" + Uri.encode(resources.configuration.locales[0].toLanguageTag())
    private val bundledAssets by lazy {
        WebViewAssetLoader.Builder().setDomain("picgift.onrender.com")
            .addPathHandler("/") { path -> bundledResponse(path) }.build()
    }

    private fun bundledNotFound() = WebResourceResponse(
        "text/plain", "UTF-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"),
        "Bundled resource unavailable".byteInputStream()
    )

    private fun bundledResponse(path: String): WebResourceResponse {
        val decoded = Uri.decode(path)
        if (decoded.startsWith('/') || decoded.contains('\\') || decoded.contains('\u0000') ||
            decoded.split('/').any { it == "." || it == ".." }) return bundledNotFound()
        val relative = decoded.removePrefix("app/").ifEmpty { "index.html" }
        val mime = when (relative.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            "ico" -> "image/x-icon"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "otf" -> "font/otf"
            "avif" -> "image/avif"
            "mp4" -> "video/mp4"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
        val text = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml")
        return try {
            WebResourceResponse(mime, if (text) "UTF-8" else null, 200, "OK",
                mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"), assets.open("app/$relative"))
        } catch (_: Exception) { bundledNotFound() }
    }

    private fun interceptBundledRequest(uri: Uri): WebResourceResponse? {
        if (uri.host != "picgift.onrender.com") return null
        // Never silently fetch a missing interface file from the remote website.
        if (uri.scheme != "https") return bundledNotFound()
        return bundledAssets.shouldInterceptRequest(uri) ?: bundledNotFound()
    }
    private var pendingFileUpload: ValueCallback<Array<Uri>>? = null
    private var pendingCameraUri: Uri? = null
    private var pendingCameraFile: File? = null
    private var pendingPickerLimit = 1
    private var pendingNotificationRoute: String? = null
    private val nativeRoutes = setOf("crear", "mis-fotos", "escenarios", "cuenta", "precios")
    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val picked = if (result.resultCode == Activity.RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                ?.distinct()?.filter { safePickedImage(it) }?.take(pendingPickerLimit)?.toTypedArray()
        } else null
        val cameraCaptured = result.resultCode == Activity.RESULT_OK &&
            (picked == null || picked.isEmpty()) &&
            (pendingCameraFile?.length() ?: 0L) > 100L
        val value = when {
            !picked.isNullOrEmpty() -> picked
            cameraCaptured -> pendingCameraUri?.let { arrayOf(it) }
            else -> null
        }
        if (!cameraCaptured) pendingCameraFile?.delete()
        pendingCameraFile = null
        pendingCameraUri = null
        val callback = pendingFileUpload
        pendingFileUpload = null
        pendingPickerLimit = 1
        callback?.onReceiveValue(value)
    }

    private fun safePickedImage(uri: Uri): Boolean {
        if (uri.scheme != "content" || uri.authority == "$packageName.photo") return false
        return try {
            contentResolver.getType(uri) in setOf("image/jpeg", "image/png", "image/webp") &&
                contentResolver.openFileDescriptor(uri, "r")?.use { true } == true
        } catch (_: Exception) { false }
    }

    private fun finishFileSelection() {
        val callback = pendingFileUpload
        pendingFileUpload = null
        pendingCameraFile?.delete()
        pendingCameraFile = null
        pendingCameraUri = null
        pendingPickerLimit = 1
        callback?.onReceiveValue(null)
    }

    private fun launchPhotoPicker(multiple: Boolean) {
        // Try the platform photo gallery, including supported backports. No document explorer.
        val photos = Intent(MediaStore.ACTION_PICK_IMAGES).apply {
            type = "image/*"
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (multiple) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, pendingPickerLimit)
        }
        try {
            filePicker.launch(photos)
        } catch (_: android.content.ActivityNotFoundException) {
            val gallery = Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI).apply {
                type = "image/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "image/webp"))
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            filePicker.launch(gallery)
        }
    }

    private fun launchCamera() {
        val directory = File(cacheDir, "camera").also { it.mkdirs() }
        val photo = File.createTempFile("picgift-capture-", ".jpg", directory)
        pendingCameraFile = photo
        val uri = FileProvider.getUriForFile(this, "$packageName.photo", photo)
        pendingCameraUri = uri
        filePicker.launch(Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            clipData = ClipData.newRawUri("PICGIFT photo", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        })
    }
    private val products = mapOf(
        "esencial" to "picgift_esencial_1",
        "magico" to "picgift_magico_5",
        "familiar" to "picgift_familiar_10"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        billing = BillingClient.newBuilder(this)
            .setListener { result, purchases ->
                val purchaseAccount = billingFlowAccount ?: currentAccount
                billingFlowAccount = null
                if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
                    deliverPurchases(purchases, purchaseAccount)
                } else if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
                    dispatchAccountEvent("picgift:play-cancelled", purchaseAccount)
                } else {
                    playError(purchaseAccount)
                }
            }
            .enableAutoServiceReconnection()
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
        connectBilling()

        web = WebView(this).apply {
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }
        val root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(22,17,16)) }
        root.addView(web, FrameLayout.LayoutParams(-1,-1))
        loading = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
        root.addView(loading, FrameLayout.LayoutParams(-1, 6, Gravity.TOP))
        failure = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(36,36,36,36)
            setBackgroundColor(Color.rgb(22,17,16))
            visibility = android.view.View.GONE
            addView(TextView(this@MainActivity).apply {
                text = getString(R.string.connection_error)
                setTextColor(Color.rgb(246,232,217))
                textSize = 18f
                gravity = Gravity.CENTER
            })
            addView(Button(this@MainActivity).apply {
                text = getString(R.string.retry)
                setOnClickListener { failure.visibility = android.view.View.GONE; web.loadUrl(homeUrl) }
            })
        }
        root.addView(failure, FrameLayout.LayoutParams(-1,-1))
        requiredUpdate = RequiredUpdateGate(this, root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
            // Draw the menu background through the navigation area, but keep taps above it.
            view.setPadding(bars.left,bars.top,bars.right,keyboard.bottom)
            nativeBottomInsetDp = if (insets.isVisible(WindowInsetsCompat.Type.ime())) 0f
                else bars.bottom / resources.displayMetrics.density
            updateNativeInsets()
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        // Register permission callbacks before the activity reaches STARTED.
        nativePush
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = true
        web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.settings.setSupportMultipleWindows(false)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.javaScriptCanOpenWindowsAutomatically = false
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, "window.picgiftBundledApp=true;", setOf("https://picgift.onrender.com"))
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                    interceptBundledRequest(request.url)
            })
        }

        // Android WebView does not provide a file picker by default.
        // Open a photo gallery for uploads and the camera only for the separate capture control.
        // Both grant access to the selected image without broad camera/storage permissions.
        web.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, progress: Int) {
                loading.progress = progress
                loading.visibility = if (progress < 100) android.view.View.VISIBLE else android.view.View.GONE
            }
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                if (!trustedPicgiftPage() || filePathCallback == null) return false
                // Do not replace an outstanding request with a second picker: its late result
                // must never be delivered into another file input.
                if (pendingFileUpload != null) { filePathCallback.onReceiveValue(null); return true }
                pendingFileUpload = filePathCallback
                val multiple = fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE
                pendingPickerLimit = if (multiple) 2 else 1
                return try {
                    if (fileChooserParams?.isCaptureEnabled == true) launchCamera()
                    else launchPhotoPicker(multiple)
                    true
                } catch (_: Exception) {
                    finishFileSelection()
                    Toast.makeText(this@MainActivity, R.string.photo_picker_unavailable, Toast.LENGTH_LONG).show()
                    true
                }
            }
        }
        // The app must handle Android's Back button instead of quitting on every inner route.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        // Save private portraits to the phone's Pictures/PICGIFT album without storage permissions.
        web.setDownloadListener { link, _, _, _, _ ->
            savePortrait(Uri.parse(link))
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "PicgiftNative", setOf("https://picgift.onrender.com")) { _, message, sourceOrigin, isMainFrame, _ ->
                if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != "https://picgift.onrender.com") return@addWebMessageListener
                try {
                    val req = JSONObject(message.data ?: return@addWebMessageListener)
                    when (req.optString("action")) {
                        "account" -> {
                            val user = req.optString("user_id")
                            runOnUiThread {
                                currentAccount = user.takeIf { Regex("^[0-9a-f-]{36}$").matches(it) }
                                pageReady = true
                                restorePurchases()
                                queryPrices()
                            }
                            return@addWebMessageListener
                        }
                        "products" -> { runOnUiThread { queryPrices() }; return@addWebMessageListener }
                        "notifications-enable" -> { runOnUiThread { nativePush.enable() }; return@addWebMessageListener }
                        "notifications-disable" -> { runOnUiThread { nativePush.disable() }; return@addWebMessageListener }
                        "notifications-status" -> { runOnUiThread { nativePush.status() }; return@addWebMessageListener }
                        "google-native" -> {
                            val automatic = req.optString("mode") == "auto"
                            runOnUiThread { googleSignIn.signIn(automatic) }
                            return@addWebMessageListener
                        }
                        "google-auth" -> {
                            val target = req.optString("url")
                            val state = req.optString("state")
                            runOnUiThread { startGoogleAuth(target, state) }
                            return@addWebMessageListener
                        }
                        "purchase" -> Unit
                        else -> return@addWebMessageListener
                    }
                    val id = req.optString("product_id")
                    val user = req.optString("user_id")
                    if (id !in products || !Regex("^[0-9a-f-]{36}$").matches(user)) return@addWebMessageListener
                    if (!pageReady || user != currentAccount) { runOnUiThread { playError(user) }; return@addWebMessageListener }
                    runOnUiThread { buy(id, user) }
                } catch (_: Exception) { }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? =
                request?.url?.let { interceptBundledRequest(it) }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                googleSignIn.cancel()
                pageReady = false
                currentAccount = null
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                if (!trustedPicgiftPage()) return
                updateNativeInsets()
                val supported = googleSignIn.isConfigured
                web.evaluateJavascript("window.picgiftBundledApp=true;window.picgiftNativeGoogleSupported=true;window.picgiftNativeCredentialManagerSupported=$supported;window.dispatchEvent(new Event('picgift:native-ready'));", null)
                dispatchNativeRoute()
            }
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    pageReady = false
                    failure.visibility = android.view.View.VISIBLE
                    loading.visibility = android.view.View.GONE
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url ?: return false
                val trusted = target.scheme == "https" && target.host == "picgift.onrender.com"
                if (request.isForMainFrame == false) return !trusted
                // Signed cross-origin anchors navigate before DownloadListener can see them.
                if (PicgiftPhotoDownloads.isTrustedPortrait(target)) { savePortrait(target); return true }
                if (trusted && target.path in listOf("/privacy.html", "/delete-account.html")) { openExternal(target); return true }
                if (!trusted) {
                    if (target.scheme in listOf("https", "mailto")) openExternal(target)
                    return true
                }
                return false
            }
        }
        if (savedInstanceState == null) web.loadUrl(homeUrl)
        else if (web.restoreState(savedInstanceState) == null) web.loadUrl(homeUrl)
        handleGoogleReturn(intent)
        receiveNotificationRoute(intent)
    }

    private fun updateNativeInsets() {
        if (!::web.isInitialized || !trustedPicgiftPage()) return
        web.evaluateJavascript("document.documentElement.style.setProperty('--picgift-native-bottom','${nativeBottomInsetDp}px');", null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleGoogleReturn(intent)
        receiveNotificationRoute(intent)
    }

    private fun receiveNotificationRoute(intent: Intent?) {
        val route = intent?.getStringExtra("picgift_route") ?: return
        intent.removeExtra("picgift_route")
        val normalized = if (route == "inspiracion") "escenarios" else route
        if (normalized !in nativeRoutes) return
        pendingNotificationRoute = normalized
        dispatchNativeRoute()
    }

    private fun dispatchNativeRoute() {
        val route = pendingNotificationRoute ?: return
        if (!::web.isInitialized || web.progress < 100 || !trustedPicgiftPage()) return
        pendingNotificationRoute = null
        val value = JSONObject.quote(route)
        web.evaluateJavascript(
            "window.picgiftPendingNativeRoute=$value;window.dispatchEvent(new CustomEvent('picgift:native-route',{detail:{route:$value}}));",
            null
        )
    }

    private fun trustedPicgiftPage() = runCatching {
        val uri = Uri.parse(web.url ?: "")
        uri.scheme == "https" && uri.host == "picgift.onrender.com"
    }.getOrDefault(false)

    private fun deliverGoogleToken(token: String, nonce: String) {
        if (!trustedPicgiftPage()) return
        // JSONObject serializes both strings safely for evaluateJavascript.
        val payload = JSONObject().put("token", token).put("nonce", nonce).toString()
        web.evaluateJavascript("window.picgiftReceiveGoogleIdToken?.($payload);", null)
    }

    private fun googleSignInError(reason: String) {
        if (!trustedPicgiftPage()) return
        val message = JSONObject.quote(reason)
        web.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('picgift:native-google-error',{detail:{reason:$message}}));", null
        )
    }

    private fun startGoogleAuth(link: String, state: String) {
        val target = Uri.parse(link)
        if (target.scheme != "https" || target.host != "uimrvgrpenccijumyiek.supabase.co" ||
            target.path != "/auth/v1/authorize" || target.getQueryParameter("provider") != "google" ||
            target.getQueryParameter("redirect_to") != "https://picgift.onrender.com/" ||
            !target.getQueryParameter("code_challenge_method").equals("s256", ignoreCase = true) ||
            !Regex("^[A-Za-z0-9_-]{43}$").matches(target.getQueryParameter("code_challenge") ?: "") ||
            !Regex("^[a-f0-9]{64}$").matches(state)) return
        // Persist only request state. The PKCE verifier stays in this WebView's private storage.
        getSharedPreferences("google_auth", MODE_PRIVATE).edit()
            .putString("state", state).putLong("created", System.currentTimeMillis()).apply()
        val browserEntry = Uri.parse("https://picgift.onrender.com/android-login.html").buildUpon()
            .appendQueryParameter("authorize", link).appendQueryParameter("state", state).build()
        try { startActivity(Intent(Intent.ACTION_VIEW, browserEntry)) }
        catch (_: android.content.ActivityNotFoundException) {
            getSharedPreferences("google_auth", MODE_PRIVATE).edit().clear().apply()
            web.evaluateJavascript("window.dispatchEvent(new Event('picgift:native-auth-error'));", null)
        }
    }

    private fun handleGoogleReturn(incoming: Intent?) {
        val target = incoming?.data ?: return
        if (target.scheme != "com.picgift.myapp" || target.host != "auth") return
        val prefs = getSharedPreferences("google_auth", MODE_PRIVATE)
        val state = target.getQueryParameter("state") ?: return
        val code = target.getQueryParameter("code") ?: return
        val age = System.currentTimeMillis() - prefs.getLong("created", 0)
        if (age !in 0..600000 || state != prefs.getString("state", null) ||
            !Regex("^[A-Za-z0-9_-]{20,512}$").matches(code)) return
        prefs.edit().clear().apply()
        incoming.data = null
        // Supabase exchanges this one-time code against the original WebView's PKCE verifier.
        web.loadUrl(Uri.parse(homeUrl).buildUpon().appendQueryParameter("code", code).build().toString())
    }

    private fun connectBilling() {
        if (billing.isReady || billingConnecting) return
        billingConnecting = true
        billing.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                billingConnecting = false
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    restorePurchases()
                    queryPrices()
                } else playError(currentAccount, "catalog")
            }
            override fun onBillingServiceDisconnected() { billingConnecting = false }
        })
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        catch (_: android.content.ActivityNotFoundException) { playError() }
    }

    private fun dispatchAccountEvent(event: String, user: String?, detail: JSONObject = JSONObject()) {
        if (user == null || !::web.isInitialized) return
        val payload = detail.put("user_id", user).toString()
        web.post {
            if (user != currentAccount || !pageReady || !trustedPicgiftPage()) return@post
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent(${JSONObject.quote(event)},{detail:$payload}));", null)
        }
    }

    private fun playError(user: String? = currentAccount, source: String = "purchase") {
        dispatchAccountEvent("picgift:play-error", user, JSONObject().put("source", source))
    }

    private fun savePortrait(target: Uri) {
        val user = currentAccount ?: return
        if (!pageReady || !trustedPicgiftPage() || !PicgiftPhotoDownloads.isTrustedPortrait(target)) return
        if (target.path?.startsWith("/storage/v1/object/sign/picgift-generated/$user/") != true) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            openExternal(target)
            return
        }
        PicgiftPhotoDownloads.save(this, target) { successful ->
            if (user != currentAccount || isFinishing || isDestroyed) return@save
            Toast.makeText(this, getString(if (successful) R.string.photo_saved else R.string.photo_save_failed), Toast.LENGTH_LONG).show()
            if (successful) dispatchAccountEvent("picgift:portrait-saved", user)
        }
    }

    private fun accountHash(user: String) = MessageDigest.getInstance("SHA-256")
        .digest(user.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun deliverPurchases(purchases: List<Purchase>, user: String? = currentAccount) {
        if (user == null || user != currentAccount || !pageReady) return
        for (purchase in purchases) {
            if (purchase.accountIdentifiers?.obfuscatedAccountId != accountHash(user)) continue
            if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
                dispatchAccountEvent("picgift:play-pending", user)
                continue
            }
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) continue
            val id = products.entries.firstOrNull { it.value in purchase.products }?.key ?: continue
            dispatchPurchase(id, purchase.purchaseToken, user)
        }
    }

    private fun restorePurchases() {
        val user = currentAccount ?: return
        if (!pageReady) return
        if (!billing.isReady) { connectBilling(); return }
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()) { result, purchases ->
                if (user != currentAccount || !pageReady) return@queryPurchasesAsync
                if (result.responseCode == BillingClient.BillingResponseCode.OK) deliverPurchases(purchases, user)
                else playError(user, "restore")
        }
    }

    private fun queryPrices() {
        val user = currentAccount ?: return
        if (!pageReady) return
        if (!billing.isReady) { connectBilling(); return }
        val params = QueryProductDetailsParams.newBuilder().setProductList(products.values.map { id ->
            QueryProductDetailsParams.Product.newBuilder().setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP).build()
        }).build()
        billing.queryProductDetailsAsync(params) { result, details ->
            if (user != currentAccount || !pageReady) return@queryProductDetailsAsync
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { playError(user, "catalog"); return@queryProductDetailsAsync }
            val prices = JSONObject()
            details.productDetailsList.forEach { product ->
                val id = products.entries.firstOrNull { it.value == product.productId }?.key
                val offer = product.oneTimePurchaseOfferDetailsList?.firstOrNull()
                if (id != null && offer != null) prices.put(id, offer.formattedPrice)
            }
            // Keep the flat prices for an older cached web client during a staged rollout.
            dispatchAccountEvent("picgift:play-prices", user, JSONObject(prices.toString()).put("prices", prices))
        }
    }

    override fun onResume() {
        super.onResume()
        if (::requiredUpdate.isInitialized) requiredUpdate.check()
        if (::web.isInitialized) web.onResume()
        if (::billing.isInitialized) restorePurchases()
        if (::web.isInitialized && trustedPicgiftPage()) nativePush.status()
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    private fun buy(id: String, user: String) {
        if (user != currentAccount || !pageReady) return
        if (billingFlowAccount != null) { playError(user); return }
        val storeId = products[id] ?: return
        if (!billing.isReady) { connectBilling(); playError(user); return }
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(storeId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()))
            .build()
        billing.queryProductDetailsAsync(params) { result, detailsResult ->
            if (user != currentAccount || !pageReady) return@queryProductDetailsAsync
            val details = detailsResult.productDetailsList.firstOrNull()
            if (details == null) { playError(user); return@queryProductDetailsAsync }
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { playError(user); return@queryProductDetailsAsync }
            runOnUiThread { launchBilling(details, user) }
        }
    }

    private fun launchBilling(details: ProductDetails, user: String) {
        if (user != currentAccount || !pageReady || billingFlowAccount != null) return
        val sha = accountHash(user)
        val offerToken = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken
        if (offerToken == null) { playError(user); return }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(sha)
            .build()
        billingFlowAccount = user
        val result = billing.launchBillingFlow(this, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) { billingFlowAccount = null; playError(user) }
    }

    private fun dispatchPurchase(id: String, token: String, user: String) {
        // A native purchase is not proof of payment: the authenticated Supabase function validates it.
        dispatchAccountEvent("picgift:play-purchase", user, JSONObject().put("product_id", id).put("purchase_token", token))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::web.isInitialized) web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        googleSignIn.cancel()
        finishFileSelection()
        if (::billing.isInitialized) billing.endConnection()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
