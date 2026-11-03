package com.spotify.media.visuals

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class SpotifyNotificationListener : NotificationListenerService() {
  override fun onListenerConnected() {
    AndroidMediaBridge.initialize(applicationContext)
    AndroidMediaBridge.refreshController()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == "com.spotify.music") AndroidMediaBridge.refreshController()
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification) {
    if (sbn.packageName == "com.spotify.music") AndroidMediaBridge.refreshController()
  }
}
