package com.picgift.christmas

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
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
                    for (purchase in purchases) {
                        if (purchase.purchaseState != com.android.billingclient.api.Purchase.PurchaseState.PURCHASED) continue
                        val productId = products.entries.firstOrNull { it.value in purchase.products }?.key ?: continue
                        dispatchPurchase(productId, purchase.purchaseToken)
                    }
                } else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
                    web.post { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('picgift:play-error'));", null) }
                }
            }
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()
        connectBilling()

        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.javaScriptCanOpenWindowsAutomatically = false

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "PicgiftNative", setOf("https://picgift.onrender.com")) { _, message, sourceOrigin, isMainFrame, _ ->
                if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != "https://picgift.onrender.com") return@addWebMessageListener
                try {
                    val req = JSONObject(message.data)
                    if (req.optString("action") != "purchase") return@addWebMessageListener
                    val id = req.optString("product_id")
                    val user = req.optString("user_id")
                    if (id !in products || !Regex("^[0-9a-f-]{36}$").matches(user)) return@addWebMessageListener
                    runOnUiThread { buy(id, user) }
                } catch (_: Exception) { }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url ?: return false
                val trusted = target.scheme == "https" && target.host == "picgift.onrender.com"
                if (!trusted) {
                    startActivity(Intent(Intent.ACTION_VIEW, target))
                    return true
                }
                return false
            }
        }
        web.loadUrl("https://picgift.onrender.com")
    }

    private fun connectBilling() {
        billing.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) { }
            override fun onBillingServiceDisconnected() { }
        })
    }

    private fun buy(id: String, user: String) {
        val storeId = products[id] ?: return
        if (!billing.isReady) { connectBilling(); return }
        currentAccount = user
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(listOf(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(storeId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()))
            .build()
        billing.queryProductDetailsAsync(params) { result, detailsResult ->
            val details = detailsResult.productDetailsList.firstOrNull() ?: return@queryProductDetailsAsync
            if (result.responseCode != BillingClient.BillingResponseCode.OK) return@queryProductDetailsAsync
            runOnUiThread { launchBilling(details, user) }
        }
    }

    private fun launchBilling(details: ProductDetails, user: String) {
        val sha = MessageDigest.getInstance("SHA-256").digest(user.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val offerToken = details.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken ?: return
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offerToken)
            .build()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParams))
            .setObfuscatedAccountId(sha)
            .build()
        billing.launchBillingFlow(this, params)
    }

    private fun dispatchPurchase(id: String, token: String) {
        // A native purchase is not proof of payment: the authenticated Supabase function validates it.
        val json = JSONObject().put("product_id", id).put("purchase_token", token).toString()
        val js = "window.dispatchEvent(new CustomEvent('picgift:play-purchase',{detail:$json}));"
        web.post { web.evaluateJavascript(js, null) }
    }

    override fun onDestroy() {
        if (::billing.isInitialized) billing.endConnection()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
