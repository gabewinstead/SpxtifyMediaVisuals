package com.spotify.media.visuals

import android.media.MediaMetadata
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.media.MediaBrowserServiceCompat
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat

/**
 * Android Auto-facing media source. It exposes the current Spotify track and
 * delegates transport actions to the existing notification/media-session bridge.
 */
class AndroidAutoMediaService : MediaBrowserServiceCompat() {
  private lateinit var session: MediaSessionCompat
  private val handler = Handler(Looper.getMainLooper())
  private val refresh = object : Runnable {
    override fun run() {
      publishCurrentTrack()
      handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    AndroidMediaBridge.initialize(applicationContext)
    session = MediaSessionCompat(this, "SpxtifyMediaVisualsAuto").apply {
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          AndroidMediaBridge.play()
          publishCurrentTrack()
        }

        override fun onPause() {
          AndroidMediaBridge.pause()
          publishCurrentTrack()
        }

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
          if (mediaId == NOW_PLAYING_ID) {
            AndroidMediaBridge.play()
            publishCurrentTrack()
          }
        }

        override fun onSkipToNext() {
          AndroidMediaBridge.next()
          publishCurrentTrack()
        }

        override fun onSkipToPrevious() {
          AndroidMediaBridge.previous()
          publishCurrentTrack()
        }
      })
      isActive = true
    }
    sessionToken = session.sessionToken
    handler.post(refresh)
  }

  override fun onDestroy() {
    handler.removeCallbacks(refresh)
    session.release()
    super.onDestroy()
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot = BrowserRoot(ROOT_ID, null)

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    if (parentId != ROOT_ID) {
      result.sendResult(mutableListOf())
      return
    }
    val metadata = AndroidMediaBridge.currentMetadata()
    val description = MediaDescriptionCompat.Builder()
      .setMediaId(NOW_PLAYING_ID)
      .setTitle(metadata?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: "Waiting for Spotify")
      .setSubtitle(metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: "Open Spotify to start playback")
      .setDescription(metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM).orEmpty())
      .apply {
        metadata?.getBitmap(MediaMetadata.METADATA_KEY_ART)?.let { setIconBitmap(it) }
      }
      .build()
    result.sendResult(
      mutableListOf(
        MediaBrowserCompat.MediaItem(description, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
      )
    )
  }

  private fun publishCurrentTrack() {
    val metadata = AndroidMediaBridge.currentMetadata()
    val state = AndroidMediaBridge.currentPlaybackState()
    val builder = MediaMetadataCompat.Builder()
      .putString(
        MediaMetadataCompat.METADATA_KEY_TITLE,
        metadata?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: "Waiting for Spotify"
      )
      .putString(
        MediaMetadataCompat.METADATA_KEY_ARTIST,
        metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: "Open Spotify to start playback"
      )
      .putString(
        MediaMetadataCompat.METADATA_KEY_ALBUM,
        metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM).orEmpty()
      )
      .putLong(
        MediaMetadataCompat.METADATA_KEY_DURATION,
        metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?.coerceAtLeast(0L) ?: 0L
      )
      .putLong(
        MediaMetadataCompat.METADATA_KEY_TRACK_NUMBER,
        metadata?.getLong(MediaMetadata.METADATA_KEY_TRACK_NUMBER)?.coerceAtLeast(0L) ?: 0L
      )
    metadata?.getBitmap(MediaMetadata.METADATA_KEY_ART)?.let {
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it)
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
    }
    session.setMetadata(builder.build())

    val playbackState = state?.let {
      when (it.state) {
        android.media.session.PlaybackState.STATE_PLAYING -> PlaybackStateCompat.STATE_PLAYING
        android.media.session.PlaybackState.STATE_BUFFERING -> PlaybackStateCompat.STATE_BUFFERING
        else -> PlaybackStateCompat.STATE_PAUSED
      }
    } ?: PlaybackStateCompat.STATE_NONE
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
        )
        .setState(playbackState, state?.position ?: 0L, 1f)
        .build()
    )
  }

  companion object {
    private const val ROOT_ID = "spxtify-root"
    private const val NOW_PLAYING_ID = "spxtify-now-playing"
  }
}
