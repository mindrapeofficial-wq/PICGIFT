package com.picgift.myapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.HapticFeedbackConstants
import android.widget.Button
import android.widget.LinearLayout
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.Purchase
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.material3.MaterialTheme
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
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
    private var pageReady = false
    private val googleSignIn by lazy { GoogleCredentialSignIn(this, ::deliverGoogleToken, ::googleSignInError) }
    private lateinit var launchCover: FrameLayout
    private lateinit var nativeTabs: ComposeView
    private lateinit var nativeHeader: ComposeView
    private val nativeRoute = mutableStateOf("crear")
    private var nativeTrustedPage = false
    private var keyboardVisible = false
    private lateinit var failure: LinearLayout
    private val homeUrl get() = "https://picgift.onrender.com/?device_lang=" + Uri.encode(resources.configuration.locales[0].toLanguageTag())
    private var pendingFileUpload: ValueCallback<Array<Uri>>? = null
    // Android Photo Picker supports scoped gallery access without storage permissions.
    private val photoPicker = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val mime = uri?.let { contentResolver.getType(it) }
        val accepted = uri?.takeIf { mime in setOf("image/jpeg", "image/png", "image/webp") }
        if (uri != null && accepted == null) {
            android.widget.Toast.makeText(this, R.string.photo_format_not_supported, android.widget.Toast.LENGTH_SHORT).show()
        }
        pendingFileUpload?.onReceiveValue(accepted?.let { arrayOf(it) })
        pendingFileUpload = null
    }
    private val products = mapOf(
        "esencial" to "picgift_esencial_1",
        "magico" to "picgift_magico_5",
        "familiar" to "picgift_familiar_10"
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        billing = BillingClient.newBuilder(this)
            .setListener { result, purchases ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
                    deliverPurchases(purchases)
                } else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
                    if (::web.isInitialized) web.post { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('picgift:play-error'));", null) }
                }
            }
            .enableAutoServiceReconnection()
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
        connectBilling()

        web = WebView(this)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.rgb(22,17,16)) }
        root.addView(web, FrameLayout.LayoutParams(-1,-1))

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
                setOnClickListener {
                    failure.visibility = android.view.View.GONE
                    launchCover.animate().cancel()
                    launchCover.alpha = 1f
                    launchCover.visibility = android.view.View.VISIBLE
                    web.loadUrl(homeUrl)
                }
            })
        }
        root.addView(failure, FrameLayout.LayoutParams(-1,-1))
        nativeHeader = ComposeView(this).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                MaterialTheme {
                    PicgiftNativeHeader(
                        selectedRoute = nativeRoute.value,
                        onBack = { navigateFromNative("crear") },
                        onAccount = { navigateFromNative("cuenta") }
                    )
                }
            }
            visibility = View.GONE
        }
        root.addView(nativeHeader, FrameLayout.LayoutParams(-1, dp(PicgiftChrome.headerHeightDp), Gravity.TOP))
        nativeTabs = ComposeView(this).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                MaterialTheme {
                    PicgiftNativeTabs(
                        selectedRoute = nativeRoute.value,
                        onTabSelected = { navigateFromNative(it) }
                    )
                }
            }
            visibility = View.GONE
        }
        root.addView(nativeTabs, FrameLayout.LayoutParams(-1, dp(PicgiftChrome.tabHeightDp), Gravity.BOTTOM))
        // A native launch surface masks web initialization and avoids a browser-style progress bar.
        launchCover = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(22,17,16))
            val logo = ImageView(this@MainActivity).apply {
                setImageResource(R.drawable.ic_launcher_official)
                scaleType = ImageView.ScaleType.FIT_CENTER
                contentDescription = "PICGIFT"
            }
            val side = (resources.displayMetrics.density * 192).toInt()
            addView(logo, FrameLayout.LayoutParams(side, side, Gravity.CENTER))
        }
        root.addView(launchCover, FrameLayout.LayoutParams(-1,-1))
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left,bars.top,bars.right,bars.bottom)
            keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            updateNativeChrome()
            insets
        }
        setContentView(root)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = android.view.View.OVER_SCROLL_NEVER
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = true
        web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.settings.setSupportMultipleWindows(false)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.javaScriptCanOpenWindowsAutomatically = false

        // Android WebView does not provide a file picker by default.
        // Allow the customer to select a photo from the device without camera/storage permissions.
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                pendingFileUpload?.onReceiveValue(null)
                pendingFileUpload = filePathCallback
                return try {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    true
                } catch (_: Exception) {
                    pendingFileUpload?.onReceiveValue(null)
                    pendingFileUpload = null
                    false
                }
            }
        }
        // The app must handle Android's Back button instead of quitting on every inner route.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Route-aware Back: close sheets, return to Studio, then exit.
                if (failure.visibility == android.view.View.VISIBLE) { finish(); return }
                web.evaluateJavascript(
                    "(function(){if(typeof window.picgiftNativeBack!=='function')return 'fallback';return window.picgiftNativeBack()?'handled':'root';})()"
                ) { result ->
                    when (result.trim('"')) {
                        "handled" -> Unit
                        "root" -> finish()
                        else -> if (web.canGoBack()) web.goBack() else finish()
                    }
                }
            }
        })
        // Images are available through short-lived signed links. Open downloads in the browser.
        web.setDownloadListener { link, _, _, _, _ ->
            val target = Uri.parse(link)
            if (target.scheme == "https" &&
                target.host == "uimrvgrpenccijumyiek.supabase.co" &&
                (target.path ?: "").startsWith("/storage/v1/object/sign/picgift-generated/")) {
                openExternal(target)
            }
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
                        "route" -> {
                            val next = req.optString("name")
                            if (next in PicgiftChrome.pageRoutes) {
                                runOnUiThread {
                                    nativeRoute.value = next
                                    updateNativeChrome()
                                }
                            }
                            return@addWebMessageListener
                        }
                        "haptic" -> {
                            runOnUiThread {
                                if (::web.isInitialized) web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                            }
                            return@addWebMessageListener
                        }
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
                    if (!pageReady || user != currentAccount) { runOnUiThread { playError() }; return@addWebMessageListener }
                    runOnUiThread { buy(id, user) }
                } catch (_: Exception) { }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                pageReady = false
                currentAccount = null
                nativeTrustedPage = false
                nativeRoute.value = "crear"
                updateNativeChrome()
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                val current = url?.let { Uri.parse(it) }
                if (current?.scheme == "https" && current.host == "picgift.onrender.com") {
                    nativeTrustedPage = true
                    updateNativeChrome()
                    val supported = googleSignIn.isConfigured
                    web.evaluateJavascript("window.picgiftNativeApp=true;window.picgiftNativeComposeShell=true;window.picgiftNativeGoogleSupported=true;window.picgiftNativeCredentialManagerSupported=$supported;document.querySelector('.mobile-nav')?.style.setProperty('display','none','important');window.dispatchEvent(new Event('picgift:native-ready'));", null)
                    if (launchCover.visibility == android.view.View.VISIBLE) {
                        launchCover.animate().alpha(0f).setDuration(210).withEndAction {
                            launchCover.visibility = android.view.View.GONE
                        }.start()
                    }
                }
            }
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    pageReady = false
                    nativeTrustedPage = false
                    updateNativeChrome()
                    failure.visibility = android.view.View.VISIBLE
                    launchCover.animate().cancel()
                    launchCover.visibility = android.view.View.GONE
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url ?: return false
                val trusted = target.scheme == "https" && target.host == "picgift.onrender.com"
                if (request.isForMainFrame == false) return !trusted
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
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleGoogleReturn(intent)
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

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

    private fun updateNativeChrome() {
        if (!::web.isInitialized || !::nativeTabs.isInitialized || !::nativeHeader.isInitialized) return
        val showTabs = nativeTrustedPage && !keyboardVisible
        val showHeader = nativeTrustedPage && nativeRoute.value != "crear"
        nativeTabs.visibility = if (showTabs) View.VISIBLE else View.GONE
        nativeHeader.visibility = if (showHeader) View.VISIBLE else View.GONE
        val layout = web.layoutParams as? FrameLayout.LayoutParams ?: return
        val bottom = if (showTabs) dp(PicgiftChrome.tabHeightDp) else 0
        val top = if (showHeader) dp(PicgiftChrome.headerHeightDp) else 0
        if (layout.bottomMargin != bottom || layout.topMargin != top) {
            layout.bottomMargin = bottom
            layout.topMargin = top
            web.layoutParams = layout
        }
    }

    private fun navigateFromNative(route: String) {
        if (!nativeTrustedPage || route !in PicgiftChrome.tabRoutes) return
        nativeTabs.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        // No custom JS interface, URL navigation or credentials; reuse the
        // authenticated existing router and its login guards.
        val message = JSONObject.quote(route)
        web.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:$message}}));", null
        )
    }

    private fun connectBilling() {
        billing.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    restorePurchases()
                    queryPrices()
                }
            }
            override fun onBillingServiceDisconnected() { }
        })
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
        catch (_: android.content.ActivityNotFoundException) { playError() }
    }

    private fun playError() {
        if (::web.isInitialized && pageReady) web.post {
            web.evaluateJavascript("window.dispatchEvent(new Event('picgift:play-error'));", null)
        }
    }

    private fun accountHash(user: String) = MessageDigest.getInstance("SHA-256")
        .digest(user.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun deliverPurchases(purchases: List<Purchase>) {
        val user = currentAccount ?: return
        if (!pageReady) return
        for (purchase in purchases) {
            if (purchase.accountIdentifiers?.obfuscatedAccountId != accountHash(user)) continue
            if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
                web.post { web.evaluateJavascript("window.dispatchEvent(new Event('picgift:play-pending'));",null) }
                continue
            }
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) continue
            val id = products.entries.firstOrNull { it.value in purchase.products }?.key ?: continue
            dispatchPurchase(id, purchase.purchaseToken)
        }
    }

    private fun restorePurchases() {
        if (!billing.isReady || !pageReady || currentAccount == null) return
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()) { result, purchases ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) deliverPurchases(purchases)
        }
    }

    private fun queryPrices() {
        if (!billing.isReady || !pageReady) return
        val params = QueryProductDetailsParams.newBuilder().setProductList(products.values.map { id ->
            QueryProductDetailsParams.Product.newBuilder().setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP).build()
        }).build()
        billing.queryProductDetailsAsync(params) { result, details ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { playError(); return@queryProductDetailsAsync }
            val prices = JSONObject()
            details.productDetailsList.forEach { product ->
                val id = products.entries.firstOrNull { it.value == product.productId }?.key
                val offer = product.oneTimePurchaseOfferDetailsList?.firstOrNull()
                if (id != null && offer != null) prices.put(id, offer.formattedPrice)
            }
            web.post { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('picgift:play-prices',{detail:$prices}));",null) }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.onResume()
        if (::billing.isInitialized) restorePurchases()
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    private fun buy(id: String, user: String) {
        val storeId = products[id] ?: return
        if (!billing.isReady) { connectBilling(); playError(); return }
        currentAccount = user
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(storeId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()))
            .build()
        billing.queryProductDetailsAsync(params) { result, detailsResult ->
            val details = detailsResult.productDetailsList.firstOrNull()
            if (details == null) { playError(); return@queryProductDetailsAsync }
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { playError(); return@queryProductDetailsAsync }
            runOnUiThread { launchBilling(details, user) }
        }
    }

    private fun launchBilling(details: ProductDetails, user: String) {
        val sha = accountHash(user)
        val offerToken = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken ?: return
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(sha)
            .build()
        val result = billing.launchBillingFlow(this, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) playError()
    }

    private fun dispatchPurchase(id: String, token: String) {
        // A native purchase is not proof of payment: the authenticated Supabase function validates it.
        val json = JSONObject().put("product_id", id).put("purchase_token", token).toString()
        val js = "window.dispatchEvent(new CustomEvent('picgift:play-purchase',{detail:$json}));"
        web.post { web.evaluateJavascript(js, null) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::web.isInitialized) web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingFileUpload?.onReceiveValue(null)
        pendingFileUpload = null
        if (::billing.isInitialized) billing.endConnection()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
