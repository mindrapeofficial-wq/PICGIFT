package com.picgift.myapp

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

/** Blocks the bundled UI until the Play release available to this tester is installed. */
class RequiredUpdateGate(private val activity: AppCompatActivity, root: FrameLayout) {
    private val manager = AppUpdateManagerFactory.create(activity)
    private var checking = false
    private var updateFlowOpen = false
    private val overlay = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(40, 40, 40, 40)
        setBackgroundColor(Color.rgb(22, 17, 16))
    }
    private val message = TextView(activity).apply {
        setTextColor(Color.rgb(246, 232, 217))
        textSize = 18f
        gravity = Gravity.CENTER
    }
    private val spinner = ProgressBar(activity)
    private val retry = Button(activity).apply {
        setText(R.string.update_now)
        setOnClickListener { check() }
    }
    private val openPlay = Button(activity).apply {
        setText(R.string.update_open_play)
        setOnClickListener { openStore() }
    }
    private val updateLauncher = activity.registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        updateFlowOpen = false
        // Immediate updates normally restart the process. If control returns, recheck
        // before exposing the old bundled interface, including after cancellation.
        if (result.resultCode == Activity.RESULT_OK) check()
        else showBlocked(R.string.update_required)
    }

    init {
        overlay.addView(message)
        overlay.addView(spinner)
        overlay.addView(retry)
        overlay.addView(openPlay)
        root.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        overlay.visibility = if (BuildConfig.DEBUG) View.GONE else View.VISIBLE
        if (!BuildConfig.DEBUG) showChecking()
    }

    fun check() {
        if (BuildConfig.DEBUG || checking || updateFlowOpen) return
        checking = true
        showChecking()
        manager.appUpdateInfo
            .addOnSuccessListener { info ->
                checking = false
                if (activity.isFinishing || activity.isDestroyed) return@addOnSuccessListener
                when (info.updateAvailability()) {
                    UpdateAvailability.UPDATE_NOT_AVAILABLE -> overlay.visibility = View.GONE
                    UpdateAvailability.UPDATE_AVAILABLE,
                    UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> {
                        showBlocked(R.string.update_required)
                        if (info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
                            try {
                                updateFlowOpen = manager.startUpdateFlowForResult(
                                    info, updateLauncher,
                                    AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
                                )
                            } catch (_: Exception) {
                                updateFlowOpen = false
                            }
                        }
                    }
                    else -> showBlocked(R.string.update_unavailable)
                }
            }
            .addOnFailureListener {
                checking = false
                if (!activity.isFinishing && !activity.isDestroyed)
                    showBlocked(R.string.update_unavailable)
            }
    }

    private fun showChecking() {
        overlay.visibility = View.VISIBLE
        message.setText(R.string.update_checking)
        spinner.visibility = View.VISIBLE
        retry.visibility = View.GONE
        openPlay.visibility = View.GONE
    }

    private fun showBlocked(messageId: Int) {
        overlay.visibility = View.VISIBLE
        message.setText(messageId)
        spinner.visibility = View.GONE
        retry.visibility = View.VISIBLE
        openPlay.visibility = View.VISIBLE
    }

    private fun openStore() {
        val packageId = activity.packageName
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageId")))
        } catch (_: ActivityNotFoundException) {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageId")))
        }
    }
}
