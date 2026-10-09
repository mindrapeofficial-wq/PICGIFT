package com.picgift.myapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Image
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal data class PicgiftCropGeometry(val frame: IntSize, val zoom: Float, val pan: Offset)

/**
 * Bitmap decoding, EXIF rotation and JPEG creation run away from the UI thread.
 * No source image is uploaded; only the normal web consent flow can submit it.
 */
internal object PicgiftCropProcessor {
    private const val maxSide = 2560

    fun loadPreview(context: Context, uri: Uri): Bitmap {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri)
        require(mime in setOf("image/jpeg", "image/png", "image/webp"))
        val bytes = resolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: -1L
        require(bytes < 0 || bytes <= 15L * 1024 * 1024)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            ?: throw IllegalArgumentException("Cannot open photo")
        require(bounds.outWidth > 0 && bounds.outHeight > 0)
        val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
        while (max(bounds.outWidth, bounds.outHeight) / opts.inSampleSize > maxSide * 2) {
            opts.inSampleSize *= 2
        }
        val raw = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
            ?: throw IllegalArgumentException("Cannot decode photo")
        val orientation = runCatching {
            resolver.openInputStream(uri)?.use {
                ExifInterface(it).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
                )
            } ?: ExifInterface.ORIENTATION_NORMAL
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
        }
        val rotated = if (matrix.isIdentity) raw else Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true).also {
            if (it !== raw) raw.recycle()
        }
        val longSide = max(rotated.width, rotated.height)
        return if (longSide > maxSide) {
            val factor = maxSide.toFloat() / longSide
            Bitmap.createScaledBitmap(
                rotated, max(1, (rotated.width * factor).roundToInt()),
                max(1, (rotated.height * factor).roundToInt()), true
            ).also { if (it !== rotated) rotated.recycle() }
        } else rotated
    }

    fun crop(bitmap: Bitmap, geometry: PicgiftCropGeometry): Bitmap {
        require(geometry.frame.width > 0 && geometry.frame.height > 0)
        val fw = geometry.frame.width.toFloat()
        val fh = geometry.frame.height.toFloat()
        val base = max(fw / bitmap.width, fh / bitmap.height)
        val effective = base * geometry.zoom.coerceIn(1f, 3f)
        val cropWidth = (fw / effective).coerceIn(1f, bitmap.width.toFloat())
        val cropHeight = (fh / effective).coerceIn(1f, bitmap.height.toFloat())
        val sx = ((bitmap.width - cropWidth) / 2f - geometry.pan.x / effective)
            .coerceIn(0f, bitmap.width - cropWidth)
        val sy = ((bitmap.height - cropHeight) / 2f - geometry.pan.y / effective)
            .coerceIn(0f, bitmap.height - cropHeight)
        val left = sx.toInt().coerceIn(0, bitmap.width - 1)
        val top = sy.toInt().coerceIn(0, bitmap.height - 1)
        val width = cropWidth.roundToInt().coerceIn(1, bitmap.width - left)
        val height = cropHeight.roundToInt().coerceIn(1, bitmap.height - top)
        return Bitmap.createBitmap(bitmap, left, top, width, height)
    }

    fun save(context: Context, bitmap: Bitmap, geometry: PicgiftCropGeometry): Uri {
        val cropped = crop(bitmap, geometry)
        try {
            val folder = File(context.cacheDir, "picgift-prepared").apply { mkdirs() }
            val output = File(folder, "portrait-" + UUID.randomUUID() + ".jpg")
            FileOutputStream(output).use {
                check(cropped.compress(Bitmap.CompressFormat.JPEG, 93, it)) { "JPEG save failed" }
            }
            return FileProvider.getUriForFile(
                context, context.packageName + ".fileprovider", output
            )
        } finally {
            if (cropped !== bitmap) cropped.recycle()
        }
    }
}

@Composable
internal fun PicgiftNativeCrop(
    bitmap: Bitmap,
    saving: Boolean,
    onCancel: () -> Unit,
    onSave: (PicgiftCropGeometry) -> Unit
) {
    var ratio by remember(bitmap) { mutableFloatStateOf(bitmap.width.toFloat() / bitmap.height) }
    var zoom by remember(bitmap) { mutableFloatStateOf(1f) }
    var pan by remember(bitmap) { mutableStateOf(Offset.Zero) }
    var frame by remember(bitmap) { mutableStateOf(IntSize.Zero) }

    fun clampOffset(offset: Offset, zoomLevel: Float): Offset {
        if (frame.width <= 0 || frame.height <= 0) return Offset.Zero
        val fw = frame.width.toFloat()
        val fh = frame.height.toFloat()
        val base = max(fw / bitmap.width, fh / bitmap.height)
        val extraX = max(0f, bitmap.width * base * zoomLevel - fw) / 2f
        val extraY = max(0f, bitmap.height * base * zoomLevel - fh) / 2f
        return Offset(offset.x.coerceIn(-extraX, extraX), offset.y.coerceIn(-extraY, extraY))
    }

    Column(
        Modifier.fillMaxSize().background(Color(0xFF100907)).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.native_crop_title), color = PicgiftChrome.parchment,
            fontSize = 22.sp)
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.native_crop_help), color = Color(0xFFD2B69E),
            fontSize = 12.sp)
        Spacer(Modifier.height(18.dp))
        Box(
            modifier = Modifier.fillMaxWidth().weight(1f),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier.fillMaxWidth()
                    .aspectRatio(ratio)
                    .clip(RoundedCornerShape(13.dp))
                    .background(Color.Black)
                    .onSizeChanged { frame = it; pan = clampOffset(pan, zoom) }
                    .pointerInput(bitmap, ratio, frame) {
                        detectTransformGestures { _, delta, zoomDelta, _ ->
                            val next = (zoom * zoomDelta).coerceIn(1f, 3f)
                            pan = clampOffset(pan + delta, next)
                            zoom = next
                        }
                    }
            ) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = stringResource(R.string.native_crop_title),
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize().graphicsLayer {
                        scaleX = zoom
                        scaleY = zoom
                        translationX = pan.x
                        translationY = pan.y
                    }
                )
                Canvas(Modifier.matchParentSize()) {
                    for (i in 1..2) {
                        val fraction = i / 3f
                        drawLine(Color.White.copy(alpha = .28f),
                            Offset(size.width * fraction, 0f),
                            Offset(size.width * fraction, size.height), strokeWidth = 1f)
                        drawLine(Color.White.copy(alpha = .28f),
                            Offset(0f, size.height * fraction),
                            Offset(size.width, size.height * fraction), strokeWidth = 1f)
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            listOf(
                stringResource(R.string.native_crop_original) to (bitmap.width.toFloat() / bitmap.height),
                "4:5" to 0.8f, "1:1" to 1f, "3:2" to 1.5f
            ).forEach { (label, next) ->
                OutlinedButton(
                    onClick = { ratio = next; zoom = 1f; pan = Offset.Zero },
                    enabled = !saving
                ) { Text(label, color = PicgiftChrome.parchment) }
            }
        }
        Slider(
            value = zoom,
            onValueChange = { zoom = it; pan = clampOffset(pan, zoom) },
            valueRange = 1f..3f,
            enabled = !saving
        )
        Row(
            Modifier.fillMaxWidth().padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            OutlinedButton(
                onClick = onCancel, enabled = !saving, modifier = Modifier.weight(1f)
            ) { Text(stringResource(R.string.native_crop_cancel)) }
            Button(
                onClick = { if (frame != IntSize.Zero) onSave(PicgiftCropGeometry(frame, zoom, pan)) },
                enabled = !saving && frame != IntSize.Zero,
                colors = ButtonDefaults.buttonColors(containerColor = PicgiftChrome.copper),
                modifier = Modifier.weight(1f)
            ) { Text(stringResource(R.string.native_crop_apply), color = Color(0xFF1B0A04)) }
        }
    }
}
