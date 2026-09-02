import QtQuick
import Quickshell
import qs.Ui

// Squawkr bar module — the Squawkr mark in the Omarchy status bar. Click opens the Squawkr
// panel (the web widget as a floating chromium --app window, via the installed launcher).
BarWidget {
  id: root
  moduleName: "squawkr.panel"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    tooltipText: "Squawkr — airspace & weather"
    iconComponent: markIcon
    onPressed: function(b) {
      if (!root.bar) return
      root.bar.run(Quickshell.env("HOME") + "/.local/bin/squawkr-widget-launch.sh")
    }
  }

  Component {
    id: markIcon
    Image {
      source: Qt.resolvedUrl("squawkr-mark.svg")
      fillMode: Image.PreserveAspectFit
      smooth: true
      sourceSize.width: 48
      sourceSize.height: 48
    }
  }
}
