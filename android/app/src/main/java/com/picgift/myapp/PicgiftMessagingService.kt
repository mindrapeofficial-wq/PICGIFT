package com.picgift.myapp

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Receives only data notifications sent by the protected Supabase admin service. */
class PicgiftMessagingService : FirebaseMessagingService() {
    companion object {
        const val CHANNEL_ID = "picgift_news"
        private val routes = setOf("crear", "mis-fotos", "inspiracion", "cuenta", "precios")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // The browser, which owns the Supabase session, registers the token on next foreground visit.
        getSharedPreferences("picgift_push", MODE_PRIVATE)
            .edit().putString("token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (!getSharedPreferences("picgift_push", MODE_PRIVATE).getBoolean("enabled", false)) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

        val title = message.data["title"]?.trim()?.take(80)?.takeIf { it.isNotBlank() } ?: return
        val body = message.data["body"]?.trim()?.take(300)?.takeIf { it.isNotBlank() } ?: return
        val route = message.data["route"]?.takeIf { it in routes } ?: "cuenta"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Novedades de PICGIFT", NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Avisos sobre novedades y colecciones de PICGIFT"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("picgift_route", route)
        }
        val identifier = message.messageId?.hashCode() ?: System.nanoTime().toInt()
        val pending = PendingIntent.getActivity(
            this, identifier, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        try {
            NotificationManagerCompat.from(this).notify(identifier, notification)
        } catch (_: SecurityException) {
            // The user can revoke Android notification permission after enabling the preference.
        }
    }
}
