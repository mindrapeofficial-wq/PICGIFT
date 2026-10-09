package com.picgift.myapp

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// The Android tabs are fully native Compose controls.
// The existing authenticated web editor, purchases and order history stay
// mounted in the same WebView until each screen can be migrated independently.
internal object PicgiftChrome {
    const val tabHeightDp = 78
    const val headerHeightDp = 58
    val background = Color(0xFF140B0A)
    val copper = Color(0xFFFFAC59)
    val parchment = Color(0xFFFFE5C7)

    val tabRoutes = setOf("crear", "mis-fotos", "escenarios", "cuenta")
    val pageRoutes = tabRoutes + setOf("inicio", "precios", "resultado", "creditos")

    fun parentTab(route: String): String = when (route) {
        "resultado", "precios", "creditos", "inicio" -> "crear"
        else -> route.takeIf { it in tabRoutes } ?: "crear"
    }
}

private data class PicgiftTab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    PicgiftTab("crear", "Crear", Icons.Filled.AddCircle),
    PicgiftTab("mis-fotos", "Mis fotos", Icons.Filled.PhotoLibrary),
    PicgiftTab("escenarios", "Inspiración", Icons.Filled.AutoAwesome),
    PicgiftTab("cuenta", "Perfil", Icons.Filled.Person)
)

@Composable
fun PicgiftNativeTabs(selectedRoute: String, onTabSelected: (String) -> Unit) {
    val active = PicgiftChrome.parentTab(selectedRoute)
    Column(
        modifier = Modifier.fillMaxWidth()
            .height(PicgiftChrome.tabHeightDp.dp)
            .background(Brush.verticalGradient(listOf(Color(0xFF241410), PicgiftChrome.background)))
    ) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF6B4028)))
        Row(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 5.dp, vertical = 6.dp)) {
            tabs.forEach { tab ->
                val selected = tab.route == active
                val tone = if (selected) PicgiftChrome.copper else Color(0xFFC3AA9B)
                Column(
                    modifier = Modifier.weight(1f).fillMaxHeight()
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (selected) Color(0xFF42261C) else Color.Transparent)
                        .clickable { onTabSelected(tab.route) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = tab.icon, contentDescription = null, tint = tone,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.height(5.dp))
                    Text(
                        text = tab.label,
                        color = tone, maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 10.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                        )
                    )
                }
            }
        }
    }
}

@Composable
fun PicgiftNativeHeader(selectedRoute: String, onBack: () -> Unit, onAccount: () -> Unit) {
    val title = when (selectedRoute) {
        "mis-fotos" -> "Mis fotos"
        "escenarios" -> "Inspiración"
        "cuenta" -> "Mi perfil"
        "precios", "creditos" -> "Packs y créditos"
        "resultado" -> "Tu resultado"
        else -> "PICGIFT"
    }
    Row(
        modifier = Modifier.fillMaxWidth().height(PicgiftChrome.headerHeightDp.dp)
            .background(PicgiftChrome.background)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.Filled.ArrowBack, contentDescription = "Volver al estudio", tint = PicgiftChrome.parchment)
        }
        Spacer(Modifier.width(9.dp))
        Text(
            text = title, color = PicgiftChrome.parchment,
            fontSize = 19.sp, fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f), maxLines = 1
        )
        IconButton(onClick = onAccount) {
            Icon(Icons.Filled.Person, contentDescription = "Abrir mi perfil", tint = PicgiftChrome.copper)
        }
    }
}
