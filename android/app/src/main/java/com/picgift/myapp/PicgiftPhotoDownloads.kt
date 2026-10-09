package com.picgift.myapp

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Save only an authenticated PICGIFT signed portrait to Android's public Pictures collection.
 * No storage permission, broad file access or externally provided download host is required.
 * The signed URL stays in memory and is never logged or passed to other applications.
 */
internal object PicgiftPhotoDownloads {
    private const val HOST = "uimrvgrpenccijumyiek.supabase.co"
    private const val MAX_BYTES = 25L * 1024 * 1024
    private val portraitPath = Regex(
        "^/storage/v1/object/sign/picgift-generated/[a-f0-9-]{36}/[a-f0-9-]{36}/final\\.(jpg|png|webp)$",
        RegexOption.IGNORE_CASE
    )

    fun isTrustedPortrait(uri: Uri): Boolean =
        uri.scheme == "https" &&
            uri.host == HOST &&
            uri.port == -1 &&
            portraitPath.matches(uri.path ?: "") &&
            !uri.getQueryParameter("token").isNullOrBlank()

    fun save(activity: Activity, uri: Uri, onResult: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !isTrustedPortrait(uri)) {
            onResult(false)
            return
        }
        Thread {
            var photoUri: Uri? = null
            var connection: HttpsURLConnection? = null
            var completed = false
            try {
                connection = URL(uri.toString()).openConnection() as HttpsURLConnection
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 15000
                connection.readTimeout = 40000
                connection.requestMethod = "GET"
                val status = connection.responseCode
                if (status != HttpsURLConnection.HTTP_OK) throw IllegalStateException("Download unavailable")
                if (connection.contentLengthLong > MAX_BYTES) throw IllegalStateException("Image too large")
                val extension = uri.lastPathSegment?.substringAfterLast('.')?.lowercase() ?: "jpg"
                val mime = when (extension) {
                    "png" -> "image/png"
                    "webp" -> "image/webp"
                    else -> "image/jpeg"
                }
                val receivedMime = connection.contentType?.substringBefore(';')?.lowercase()
                if (receivedMime !in setOf(mime, "application/octet-stream")) {
                    throw IllegalStateException("Unexpected file type")
                }
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, "PICGIFT-${System.currentTimeMillis()}.$extension")
                    put(MediaStore.Images.Media.MIME_TYPE, mime)
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PICGIFT")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                photoUri = activity.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("Could not create picture")
                activity.contentResolver.openOutputStream(photoUri!!)?.use { output ->
                    connection.inputStream.use { input ->
                        val buffer = ByteArray(8192)
                        var bytesRead = 0L
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            bytesRead += count
                            if (bytesRead > MAX_BYTES) throw IllegalStateException("Image too large")
                            output.write(buffer, 0, count)
                        }
                        if (bytesRead < 1000) throw IllegalStateException("Empty portrait")
                    }
                } ?: throw IllegalStateException("Could not save picture")
                activity.contentResolver.update(photoUri!!, ContentValues().apply {
                    put(MediaStore.Images.Media.IS_PENDING, 0)
                }, null, null)
                completed = true
            } catch (_: Exception) {
                // Do not print the exception; signed portrait URLs must never enter logs.
            } finally {
                if (!completed && photoUri != null) {
                    try { activity.contentResolver.delete(photoUri!!, null, null) }
                    catch (_: Exception) {}
                }
                connection?.disconnect()
                activity.runOnUiThread { onResult(completed) }
            }
        }.start()
    }
}
