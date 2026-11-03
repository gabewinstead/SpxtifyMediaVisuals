package com.spotify.media.visuals

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.Screen
import androidx.car.app.validation.HostValidator
import androidx.car.app.model.Action
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.CarContext

class NowPlayingCarAppService : CarAppService() {
  override fun createHostValidator(): HostValidator =
    HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

  override fun onCreateSession(): Session = NowPlayingCarSession()
}

private class NowPlayingCarSession : Session() {
  override fun onCreateScreen(intent: Intent): Screen =
    NowPlayingCarScreen(carContext)
}

private class NowPlayingCarScreen(carContext: CarContext) : Screen(carContext) {
  override fun onGetTemplate(): Template {
    val metadata = AndroidMediaBridge.currentMetadata()
    val title = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE)
      ?: "Waiting for playback"
    val artist = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST)
      ?: "Open the phone app to connect music"

    return PaneTemplate.Builder(
      Pane.Builder()
        .addRow(
          Row.Builder()
            .setTitle(title)
            .addText(artist)
            .build()
        )
        .addRow(
          Row.Builder()
            .setTitle("Playback is available in the media controls")
            .build()
        )
        .build()
    )
      .setTitle("NowPlaying Visuals")
      .setHeaderAction(Action.APP_ICON)
      .build()
  }
}
