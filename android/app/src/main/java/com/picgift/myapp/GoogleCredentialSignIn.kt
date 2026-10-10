package com.picgift.myapp

import androidx.appcompat.app.AppCompatActivity
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.credentials.CustomCredential
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * PICGIFT native Google account chooser. Only a Google ID token and a fresh, un-hashed
 * nonce return to the trusted PICGIFT WebView; Supabase verifies them server-side.
 *
 * WEB client ID must be an authorized Google OAuth client for the same Supabase project.
 * No Google client secret or Firebase admin key belongs in this app.
 */
internal class GoogleCredentialSignIn(
    private val activity: AppCompatActivity,
    private val onToken: (idToken: String, nonce: String) -> Unit,
    private val onFailure: (reason: String) -> Unit
) {
    private val credentialManager by lazy { CredentialManager.create(activity) }
    private val random = SecureRandom()
    private val clientId = BuildConfig.PICGIFT_GOOGLE_WEB_CLIENT_ID
    val isConfigured get() = clientId.endsWith(".apps.googleusercontent.com") &&
        clientId.length < 256

    private var busy = false
    private var cancellation: CancellationSignal? = null

    fun cancel() {
        val previous = cancellation
        cancellation = null
        busy = false
        previous?.cancel()
    }

    fun signIn(automatic: Boolean) {
        if (busy || activity.isFinishing || activity.isDestroyed) return
        if (!isConfigured) {
            onFailure("unavailable")
            return
        }
        busy = true
        cancellation = CancellationSignal()
        val nonce = ByteArray(32).also { random.nextBytes(it) }
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val hashedNonce = MessageDigest.getInstance("SHA-256")
            .digest(nonce.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }

        if (automatic) requestAutomatic(nonce, hashedNonce, authorizedOnly = true)
        else requestExplicit(nonce, hashedNonce)
    }

    private fun requestAutomatic(nonce: String, hashedNonce: String, authorizedOnly: Boolean) {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(clientId)
            .setFilterByAuthorizedAccounts(authorizedOnly)
            .setAutoSelectEnabled(false)
            .setNonce(hashedNonce)
            .build()
        request(GetCredentialRequest.Builder().addCredentialOption(option).build(), nonce) { error ->
            if (authorizedOnly && error is NoCredentialException) {
                // First-time customers should also see Google accounts on their phone.
                requestAutomatic(nonce, hashedNonce, authorizedOnly = false)
            } else finishFailure(error)
        }
    }

    private fun requestExplicit(nonce: String, hashedNonce: String) {
        val option = GetSignInWithGoogleOption.Builder(clientId)
            .setNonce(hashedNonce)
            .build()
        request(GetCredentialRequest.Builder().addCredentialOption(option).build(), nonce) { error ->
            finishFailure(error)
        }
    }

    private fun request(
        request: GetCredentialRequest,
        nonce: String,
        onCredentialError: (GetCredentialException) -> Unit
    ) {
        val signal = cancellation ?: return
        try {
        credentialManager.getCredentialAsync(
            activity, request, signal, ContextCompat.getMainExecutor(activity),
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    if (cancellation !== signal || activity.isFinishing || activity.isDestroyed) return
                    val credential = result.credential
                    if (credential !is CustomCredential ||
                        credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        busy = false
                        cancellation = null
                        onFailure("invalid-credential")
                        return
                    }
                    try {
                        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
                        busy = false
                        cancellation = null
                        onToken(token, nonce)
                    } catch (_: Exception) {
                        busy = false
                        cancellation = null
                        onFailure("invalid-credential")
                    }
                }

                override fun onError(e: GetCredentialException) {
                    if (cancellation !== signal || activity.isFinishing || activity.isDestroyed) return
                    onCredentialError(e)
                }
            }
        )
        } catch (_: Exception) {
            if (cancellation === signal) {
                busy = false
                cancellation = null
                onFailure("unavailable")
            }
        }
    }

    private fun finishFailure(error: GetCredentialException) {
        busy = false
        cancellation = null
        onFailure(if (error is GetCredentialCancellationException) "cancelled" else "failed")
    }
}
