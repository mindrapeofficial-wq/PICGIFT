package com.picgift.myapp

import android.graphics.Bitmap
import android.content.res.Configuration
import android.net.Uri
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.Locale

/** Native presentation around the existing installed, authenticated WebView.
 * Authentication, consent, billing and server mutations keep their existing owners.
 * MainActivity must validate message origin/main-frame before forwarding a message.
 */
internal class PicgiftNativeExperience(
    private val activity: AppCompatActivity,
    private val root: FrameLayout,
    private val web: WebView,
    private val trustedPage: () -> Boolean,
    private val currentAccount: () -> String?
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val route = mutableStateOf("crear")
    private val language = mutableStateOf(if (activity.resources.configuration.locales[0].language == "es") "es" else "en")
    private val items = mutableStateOf<List<PicgiftGalleryItem>>(emptyList())
    private val favorites = mutableStateOf<Set<String>>(emptySet())
    private val galleryLoading = mutableStateOf(false)
    private val galleryFailed = mutableStateOf(false)
    private val cropImage = mutableStateOf<Bitmap?>(null)
    private val cropSaving = mutableStateOf(false)
    private var active = false
    private var destroyed = false
    private var keyboardVisible = false
    private var bottomInset = 0
    private var overlayVisible = false
    private var webGallery = false
    private var galleryOwner: String? = null
    private var gallerySynced = false
    private var lastAccount: String? = null
    private var cropOpen = false
    private var cropSerial = 0L
    private var pageSerial = 0L
    private var cropDone: ((Uri?) -> Unit)? = null
    private var lastHaptic = 0L

    private val tabs = composeView {
        PicgiftNativeTabs(route.value, ::navigate)
    }
    private val header = composeView {
        PicgiftNativeHeader(route.value, { navigate("crear") }, { navigate("cuenta") })
    }
    private val gallery = composeView {
        PicgiftNativeGallery(
            items.value, favorites.value, galleryLoading.value, galleryFailed.value,
            onOpen = { galleryAction("open", it) },
            onFavorite = { galleryAction("favorite", it) },
            onDownload = { galleryAction("download", it) },
            onCreate = { navigate("crear") },
            onRefresh = { evaluate("window.dispatchEvent(new Event('picgift:gallery-refresh'));") },
            onManage = { webGallery = true; updateLayout() }
        )
    }
    private val crop = composeView {
        val image = cropImage.value
        if (image == null) {
            Box(Modifier.fillMaxSize().background(PicgiftChrome.background),
                contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PicgiftChrome.copper)
            }
        } else {
            PicgiftNativeCrop(image, cropSaving.value, ::cancelPhotoPreparation,
                { geometry -> saveCrop(image, geometry) })
        }
    }

    init {
        // Insert before loading/failure/update views: those remain above native content.
        root.addView(gallery, FrameLayout.LayoutParams(-1, -1))
        root.addView(header, FrameLayout.LayoutParams(-1, dp(PicgiftChrome.headerHeightDp), Gravity.TOP))
        root.addView(tabs, FrameLayout.LayoutParams(-1, dp(PicgiftChrome.tabHeightDp), Gravity.BOTTOM))
        root.addView(crop, FrameLayout.LayoutParams(-1, -1))
        // Never remove a recently returned FileProvider URI on Activity recreation.
        // Android can still be reading that file into the installed WebView.
        val before = System.currentTimeMillis() - 24L * 60 * 60 * 1000
        runCatching {
            for (name in listOf("picgift-prepared", "picgift-prepared-input")) {
                File(activity.cacheDir, name).listFiles()
                    ?.filter { it.isFile && it.lastModified() < before }?.forEach { it.delete() }
            }
        }
    }

    private fun composeView(content: @Composable () -> Unit) = ComposeView(activity).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        setContent {
            val configuration = remember(language.value) {
                Configuration(activity.resources.configuration).apply { setLocale(Locale.forLanguageTag(language.value)) }
            }
            val localized = remember(language.value) { activity.createConfigurationContext(configuration) }
            CompositionLocalProvider(LocalContext provides localized, LocalConfiguration provides configuration) {
                MaterialTheme(colorScheme = darkColorScheme(
                    primary = PicgiftChrome.copper, background = PicgiftChrome.background,
                    surface = PicgiftChrome.background, onSurface = PicgiftChrome.parchment
                )) { content() }
            }
        }
        visibility = View.GONE
    }

    fun setInsets(bottomPx: Int, keyboardVisible: Boolean) {
        bottomInset = bottomPx.coerceAtLeast(0)
        this.keyboardVisible = keyboardVisible
        updateLayout()
    }

    fun onAccountChanged(user: String?) {
        if (user != lastAccount) {
            lastAccount = user
            clearGallery()
            cancelPhotoPreparation()
        }
        evaluate("window.picgiftNativeGallerySnapshot?.();")
    }

    fun onPageStarted() {
        pageSerial++
        active = false
        overlayVisible = false
        webGallery = false
        route.value = "crear"
        clearGallery()
        cancelPhotoPreparation()
        updateLayout()
    }

    fun onPageFinished() {
        if (destroyed || !isMainInterface() ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        // Pages such as admin/login do not load the shell and must retain their full UI.
        // Only activate after the bundled shell acknowledges the protocol.
        web.evaluateJavascript("window.picgiftNativeApp=true;window.picgiftNativeComposeAvailable=true;" +
            "window.dispatchEvent(new Event('picgift:native-ready'));", null)
    }

    fun onPageFailed() {
        onPageStarted()
    }

    /** Called only after MainActivity's trusted-origin and main-frame checks. */
    fun handleMessage(request: JSONObject): Boolean {
        val action = request.optString("action")
        if (action !in setOf("shell-ready", "language", "route", "gallery-sync", "gallery-clear", "web-overlay", "haptic")) return false
        activity.runOnUiThread {
            if (destroyed || !isMainInterface()) return@runOnUiThread
            if (action == "shell-ready" && request.optInt("version") == 1) {
                active = true
                updateLayout()
                evaluate("window.picgiftNativeComposeShell=true;window.dispatchEvent(new Event('picgift:native-ready'));")
                return@runOnUiThread
            }
            if (!active) return@runOnUiThread
            when (action) {
                "language" -> request.optString("language").takeIf { it == "es" || it == "en" }
                    ?.let { language.value = it }
                "route" -> {
                    val next = request.optString("name")
                    if (next in PicgiftChrome.pageRoutes) {
                        if (route.value != next) webGallery = false
                        route.value = next
                        updateLayout()
                    }
                }
                "gallery-clear" -> clearGallery()
                "gallery-sync" -> syncGallery(request)
                "web-overlay" -> {
                    overlayVisible = request.optBoolean("visible")
                    updateLayout()
                }
                "haptic" -> {
                    val now = android.os.SystemClock.uptimeMillis()
                    if (now - lastHaptic >= 85L) {
                        lastHaptic = now
                        web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                    }
                }
            }
        }
        return true
    }

    private fun syncGallery(request: JSONObject) {
        val owner = request.optString("user_id")
        if (!PicgiftGalleryValidator.uuid(owner) || owner != currentAccount()) return
        val values = request.optJSONArray("items") ?: return
        val parsed = (0 until minOf(values.length(), 30)).mapNotNull { index ->
            values.optJSONObject(index)?.let { PicgiftGalleryValidator.parse(it, owner) }
        }.distinctBy { it.id }
        val ids = parsed.map { it.id }.toSet()
        val marked = request.optJSONArray("favorites")
        favorites.value = (0 until minOf(marked?.length() ?: 0, 30))
            .mapNotNull { marked?.optString(it) }.filter { it in ids }.toSet()
        items.value = parsed
        galleryOwner = owner
        gallerySynced = true
        galleryLoading.value = request.optBoolean("loading")
        galleryFailed.value = request.optBoolean("error")
        updateLayout()
    }

    private fun clearGallery() {
        items.value = emptyList()
        favorites.value = emptySet()
        galleryOwner = null
        gallerySynced = false
        galleryLoading.value = false
        galleryFailed.value = false
        updateLayout()
    }

    private fun galleryAction(action: String, id: String) {
        val owner = currentAccount() ?: return
        if (owner != galleryOwner || items.value.none { it.id == id } ||
            action !in setOf("open", "favorite", "download")) return
        evaluate("window.picgiftNativeGalleryAction?.(" + JSONObject.quote(action) + "," +
            JSONObject.quote(id) + "," + JSONObject.quote(owner) + ");")
    }

    private fun navigate(next: String) {
        if (!active || destroyed || cropOpen || !trustedPage()) return
        if (next != "camera" && next !in PicgiftChrome.tabRoutes) return
        tabs.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        webGallery = false
        updateLayout()
        if (next == "camera") {
            evaluate("window.picgiftNativeCamera?.();")
        } else {
            evaluate("window.dispatchEvent(new CustomEvent('picgift:route',{detail:{name:" +
                JSONObject.quote(next) + "}}));")
        }
    }

    /** The caller retains its original chooser callback until done runs once. */
    fun preparePhoto(uri: Uri, done: (Uri?) -> Unit): Boolean {
        if (!active || destroyed || !trustedPage() || cropOpen || uri.scheme != "content") return false
        val serial = ++cropSerial
        val owner = currentAccount()
        cropDone = done
        cropOpen = true
        cropSaving.value = false
        cropImage.value = null
        updateLayout()
        executor.execute {
            val decoded = runCatching { PicgiftCropProcessor.loadPreview(activity.applicationContext, uri) }
            activity.runOnUiThread {
                if (destroyed || serial != cropSerial || !cropOpen || owner != currentAccount()) {
                    decoded.getOrNull()?.recycle()
                    return@runOnUiThread
                }
                if (decoded.isSuccess) cropImage.value = decoded.getOrThrow()
                else {
                    Toast.makeText(activity, R.string.native_crop_error, Toast.LENGTH_LONG).show()
                    // Keep the existing local web editor as a fallback for readable photos.
                    finishCrop(uri)
                }
            }
        }
        return true
    }

    private fun saveCrop(bitmap: Bitmap, geometry: PicgiftCropGeometry) {
        if (destroyed || !cropOpen || cropSaving.value) return
        val serial = cropSerial
        val owner = currentAccount()
        cropSaving.value = true
        executor.execute {
            val result = runCatching { PicgiftCropProcessor.save(activity.applicationContext, bitmap, geometry) }
            activity.runOnUiThread {
                if (destroyed || serial != cropSerial || !cropOpen || owner != currentAccount()) {
                    result.getOrNull()?.let(::discardPrepared)
                    return@runOnUiThread
                }
                if (result.isSuccess) finishCrop(result.getOrThrow())
                else {
                    cropSaving.value = false
                    Toast.makeText(activity, R.string.native_crop_error, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    fun cancelPhotoPreparation() = finishCrop(null)

    private fun finishCrop(uri: Uri?) {
        cropSerial++
        cropOpen = false
        cropSaving.value = false
        // Let the renderer/GC release displayed bitmaps. Recycling immediately races
        // Compose drawing and an in-flight JPEG worker on cancellation or rotation.
        cropImage.value = null
        val done = cropDone
        cropDone = null
        updateLayout()
        done?.invoke(uri)
    }

    private fun discardPrepared(uri: Uri) {
        if (uri.scheme == "content" && uri.authority == activity.packageName + ".prepared")
            runCatching { activity.contentResolver.delete(uri, null, null) }
    }

    fun onBackPressed(unhandled: () -> Unit) {
        if (cropOpen) { cancelPhotoPreparation(); return }
        if (webGallery) { webGallery = false; updateLayout(); return }
        if (!active || !trustedPage()) { unhandled(); return }
        val serial = pageSerial
        web.evaluateJavascript("window.picgiftNativeBack?.() === true") { handled ->
            if (!destroyed && serial == pageSerial && handled != "true") unhandled()
        }
    }

    private fun evaluate(script: String) {
        if (!destroyed && active && trustedPage()) web.evaluateJavascript(script, null)
    }

    private fun isMainInterface(): Boolean = trustedPage() && runCatching {
        Uri.parse(web.url ?: "").path in setOf("/", "/index.html", "/app/", "/app/index.html")
    }.getOrDefault(false)

    private fun updateLayout() {
        val showChrome = active && !destroyed && !cropOpen && !overlayVisible
        val showTabs = showChrome && !keyboardVisible
        val showHeader = showChrome && route.value != "crear"
        val top = if (showHeader) dp(PicgiftChrome.headerHeightDp) else 0
        val bottom = if (showTabs) dp(PicgiftChrome.tabHeightDp) + bottomInset else 0
        tabs.visibility = if (showTabs) View.VISIBLE else View.GONE
        tabs.setPadding(0, 0, 0, bottomInset)
        (tabs.layoutParams as FrameLayout.LayoutParams).apply {
            if (height != dp(PicgiftChrome.tabHeightDp) + bottomInset) {
                height = dp(PicgiftChrome.tabHeightDp) + bottomInset
                tabs.layoutParams = this
            }
        }
        header.visibility = if (showHeader) View.VISIBLE else View.GONE
        gallery.visibility = if (showChrome && !webGallery && !keyboardVisible &&
            route.value == "mis-fotos" && gallerySynced && galleryOwner != null &&
            galleryOwner == currentAccount()) View.VISIBLE else View.GONE
        crop.visibility = if (cropOpen && !destroyed) View.VISIBLE else View.GONE
        crop.setPadding(0, 0, 0, if (keyboardVisible) 0 else bottomInset)
        for (view in listOf(web, gallery)) {
            val params = view.layoutParams as? FrameLayout.LayoutParams ?: continue
            if (params.topMargin != top || params.bottomMargin != bottom) {
                params.topMargin = top
                params.bottomMargin = bottom
                view.layoutParams = params
            }
        }
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density + .5f).toInt()

    fun destroy() {
        if (destroyed) return
        destroyed = true
        active = false
        pageSerial++
        cancelPhotoPreparation()
        clearGallery()
        executor.shutdownNow()
        listOf(tabs, header, gallery, crop).forEach { it.disposeComposition() }
    }
}
