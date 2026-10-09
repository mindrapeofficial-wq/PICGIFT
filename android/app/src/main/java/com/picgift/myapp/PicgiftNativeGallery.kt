package com.picgift.myapp

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import org.json.JSONObject
import java.util.UUID

@Immutable
internal data class PicgiftGalleryItem(
    val id: String,
    val name: String,
    val status: String,
    val createdAt: String,
    val imageUrl: String?
)

/** Only owner-scoped gallery metadata is mirrored into Android.
 * Supabase access tokens, storage keys, original images and portrait references
 * are never transferred through this channel. Signed preview URLs are ephemeral.
 */
internal object PicgiftGalleryValidator {
    private val states = setOf("queued", "analyzing", "generating", "reviewing", "completed", "needs_review", "failed")
    private const val signedPrefix = "/storage/v1/object/sign/picgift-generated/"

    fun uuid(id: String): Boolean = runCatching {
        UUID.fromString(id).toString().equals(id, ignoreCase = true)
    }.getOrDefault(false) && id.length == 36

    fun privatePreview(value: String?): String? {
        if (value.isNullOrBlank() || value.length > 2100) return null
        return runCatching {
            val uri = Uri.parse(value)
            if (uri.scheme == "https" &&
                uri.host == "uimrvgrpenccijumyiek.supabase.co" &&
                uri.path?.startsWith(signedPrefix) == true &&
                !uri.getQueryParameter("token").isNullOrBlank()
            ) value else null
        }.getOrNull()
    }

    fun parse(input: JSONObject): PicgiftGalleryItem? {
        val id = input.optString("id")
        val name = input.optString("name").take(80)
        val status = input.optString("status")
        val created = input.optString("created_at").take(40)
        if (!uuid(id) || status !in states || created.length < 10) return null
        return PicgiftGalleryItem(
            id = id,
            name = name.ifBlank { "PICGIFT" },
            status = status,
            createdAt = created,
            imageUrl = if (status == "completed") privatePreview(input.optString("preview")) else null
        )
    }
}

@Composable
internal fun PicgiftNativeGallery(
    portraits: List<PicgiftGalleryItem>,
    favorites: Set<String>,
    onOpen: (String) -> Unit,
    onFavorite: (String) -> Unit,
    onCreate: () -> Unit,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize()
            .background(Color(0xFF0D0808))
            .padding(horizontal = 14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(stringResource(R.string.native_gallery_title), fontSize = 21.sp,
                    fontWeight = FontWeight.SemiBold, color = PicgiftChrome.parchment)
                Text(stringResource(R.string.native_gallery_description), fontSize = 12.sp,
                    color = Color(0xFFBEA893))
            }
            IconButton(onClick = onRefresh) {
                Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.native_gallery_refresh),
                    tint = PicgiftChrome.copper)
            }
        }
        if (portraits.isEmpty()) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.native_gallery_empty), color = PicgiftChrome.parchment)
                    Spacer(Modifier.height(15.dp))
                    Button(onClick = onCreate, colors = ButtonDefaults.buttonColors(containerColor = PicgiftChrome.copper)) {
                        Icon(Icons.Filled.Add, contentDescription = null, tint = PicgiftChrome.background)
                        Text(stringResource(R.string.native_nav_create), color = PicgiftChrome.background)
                    }
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(11.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(portraits, key = { it.id }) { portrait ->
                    val context = LocalContext.current
                    val model = remember(portrait.imageUrl) {
                        ImageRequest.Builder(context)
                            .data(portrait.imageUrl)
                            .crossfade(true)
                            .diskCachePolicy(CachePolicy.DISABLED)
                            .memoryCachePolicy(CachePolicy.DISABLED)
                            .build()
                    }
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF20120F))
                    ) {
                        Box(
                            Modifier.fillMaxWidth().aspectRatio(0.85f)
                                .clickable { onOpen(portrait.id) }
                        ) {
                            if (portrait.imageUrl != null) {
                                AsyncImage(
                                    model = model,
                                    contentDescription = portrait.name,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    if (portrait.status in setOf("queued", "analyzing", "generating", "reviewing")) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(28.dp), color = PicgiftChrome.copper,
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        Text("✧", fontSize = 34.sp, color = PicgiftChrome.copper)
                                    }
                                }
                            }
                            IconButton(
                                onClick = { onFavorite(portrait.id) },
                                modifier = Modifier.align(Alignment.TopEnd)
                            ) {
                                Icon(
                                    imageVector = if (portrait.id in favorites) Icons.Filled.Favorite
                                        else Icons.Filled.FavoriteBorder,
                                    contentDescription = stringResource(R.string.native_gallery_favorite),
                                    tint = PicgiftChrome.copper
                                )
                            }
                        }
                        Column(Modifier.padding(horizontal = 10.dp, vertical = 9.dp)) {
                            Text(portrait.name, color = PicgiftChrome.parchment,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelLarge)
                            Text(
                                if (portrait.status == "completed") stringResource(R.string.native_gallery_ready)
                                else portrait.status,
                                color = Color(0xFFD5AE87), fontSize = 11.sp
                            )
                            Text(portrait.createdAt.take(10), color = Color(0xFF9F8A7D), fontSize = 10.sp)
                        }
                    }
                }
            }
        }
    }
}
