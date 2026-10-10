package com.picgift.myapp

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.util.UUID

/** Token registration stays in the authenticated web session, never in native admin code. */
internal class NativePushController(
    private val activity: AppCompatActivity,
    private val dispatch: (JSONObject) -> Unit
) {
    private val preferences = activity.getSharedPreferences("picgift_push", Context.MODE_PRIVATE)
    private val installationId = preferences.getString("installation_id", null)
        ?: UUID.randomUUID().toString().also { preferences.edit().putString("installation_id", it).apply() }
    private var requestPending = false
    private val permission = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        requestPending = false
        status()
    }

    fun enable() {
        if (!configured()) { announce("not_configured"); return }
        preferences.edit().putBoolean("enabled", true).apply()
        if (Build.VERSION.SDK_INT >= 33 && !permissionGranted()) {
            if (!requestPending) {
                requestPending = true
                permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else status()
    }

    fun disable() {
        preferences.edit().putBoolean("enabled", false).apply()
        if (configured()) FirebaseMessaging.getInstance().isAutoInitEnabled = false
        announce("disabled")
    }

    fun status() {
        if (!preferences.getBoolean("enabled", false)) { announce("disabled"); return }
        if (!configured()) { announce("not_configured"); return }
        if (!permissionGranted() || !NotificationManagerCompat.from(activity).areNotificationsEnabled()) {
            announce("permission_denied"); return
        }
        val messaging = FirebaseMessaging.getInstance()
        messaging.isAutoInitEnabled = true
        messaging.token.addOnSuccessListener { token ->
            // A response arriving after logout must not reactivate this device.
            if (preferences.getBoolean("enabled", false) && permissionGranted()) {
                preferences.edit().putString("token", token).apply()
                announce("ready", token)
            }
        }.addOnFailureListener { announce("unavailable") }
    }

    private fun permissionGranted() = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun configured() = BuildConfig.PICGIFT_FIREBASE_CONFIGURED && FirebaseApp.getApps(activity).isNotEmpty()

    private fun announce(status: String, token: String? = null) {
        if (activity.isFinishing || activity.isDestroyed) return
        val detail = JSONObject().put("status", status).put("installation_id", installationId)
        if (token != null) detail.put("token", token)
        dispatch(detail)
    }
}
