package com.spotify.media.visuals

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.provider.Settings
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream

object AndroidMediaBridge {
  private const val spotifyPackage = "com.spotify.music"
  @Volatile private var controller: MediaController? = null
  @Volatile private var context: Context? = null

  @JvmStatic
  fun initialize(appContext: Context) {
    context = appContext.applicationContext
    refreshController()
  }

  @JvmStatic
  fun refreshController() {
    val appContext = context ?: return
    if (!isNotificationAccessEnabled(appContext)) {
      controller = null
      return
    }
    val manager = appContext.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
      ?: return
    val component = ComponentName(appContext, SpotifyNotificationListener::class.java)
    controller = manager.getActiveSessions(component)
      .firstOrNull { it.packageName == spotifyPackage }
  }

  @JvmStatic
  fun hasNotificationAccess(): String {
    val appContext = context ?: return "false"
    return isNotificationAccessEnabled(appContext).toString()
  }

  private fun isNotificationAccessEnabled(appContext: Context): Boolean =
    Settings.Secure.getString(appContext.contentResolver, "enabled_notification_listeners")
      ?.split(":")
      ?.mapNotNull { ComponentName.unflattenFromString(it) }
      ?.any { it.packageName == appContext.packageName } == true

  @JvmStatic
  fun openNotificationAccessSettings(): String {
    context?.startActivity(
      Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    return JSONObject().put("ok", true).toString()
  }

  @JvmStatic
  fun currentTrack(): String = currentTrack(false)

  @JvmStatic
  fun currentTrackWithArt(): String = currentTrack(true)

  @JvmStatic
  fun currentMetadata(): MediaMetadata? {
    refreshController()
    return controller?.metadata
  }

  @JvmStatic
  fun currentPlaybackState(): android.media.session.PlaybackState? {
    refreshController()
    return controller?.playbackState
  }

  private fun currentTrack(includeArt: Boolean): String {
    refreshController()
    val active = controller ?: return error("Spotify media access is not enabled or Spotify is not playing")
    val metadata = active.metadata ?: return error("Spotify has not published track metadata")
    val duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION).coerceAtLeast(0L) / 1000.0
    val position = active.playbackState?.position?.coerceAtLeast(0L)?.div(1000.0) ?: 0.0
    return trackJson(active, metadata, position, duration, includeArt)
  }

  @JvmStatic
  fun playPause(): String = transport { it.transportControls?.play()?.let { Unit } ?: it.transportControls?.pause() }

  @JvmStatic
  fun play(): String = transport { it.transportControls?.play() }

  @JvmStatic
  fun pause(): String = transport { it.transportControls?.pause() }

  @JvmStatic
  fun next(): String = transport { it.transportControls?.skipToNext() }

  @JvmStatic
  fun previous(): String = transport { it.transportControls?.skipToPrevious() }

  private fun transport(action: (MediaController) -> Unit): String {
    refreshController()
    val active = controller ?: return error("Spotify media session is unavailable")
    return try {
      action(active)
      JSONObject().put("ok", true).toString()
    } catch (exception: Exception) {
      error(exception.message ?: "Unable to control Spotify")
    }
  }

  private fun trackJson(
    active: MediaController,
    metadata: MediaMetadata,
    position: Double,
    duration: Double,
    includeArt: Boolean
  ): String {
    val result = JSONObject()
      .put("title", metadata.getString(MediaMetadata.METADATA_KEY_TITLE).orEmpty())
      .put("artist", metadata.getString(MediaMetadata.METADATA_KEY_ARTIST).orEmpty())
      .put("album", metadata.getString(MediaMetadata.METADATA_KEY_ALBUM).orEmpty())
      .put("duration", duration)
      .put("position", position)
      .put("playing", active.playbackState?.state == 3)
    if (includeArt) {
      val art = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART) ?:
        metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
      if (art != null) result.put("albumArtUrl", bitmapDataUrl(art))
    }
    return result.toString()
  }

  private fun bitmapDataUrl(bitmap: Bitmap): String {
    val output = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 90, output)
    return "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  private fun error(message: String): String = JSONObject().put("error", message).toString()
}
