import QtQuick
import QtQuick.Effects
import Quickshell
import qs.Ui
import qs.Commons

// Squawkr bar module — the Squawkr mark in the Omarchy status bar. Click opens the Squawkr
// panel (the web widget as a floating chromium --app window, via the installed launcher).
//
// The mark is a monochrome SVG. Quickshell's own bar glyphs take Color.foreground so they follow
// the theme (dark on a light/transparent bar, light on a dark one); a plain Image would not, so
// it is recoloured to Color.foreground with a MultiEffect. That is the fix for "the mark stays
// white when the bar goes transparent and every other icon turns dark".
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
    Item {
      // The raw SVG, hidden — used only as the shape/source for the tint below.
      Image {
        id: markSrc
        anchors.fill: parent
        source: Qt.resolvedUrl("squawkr-mark.svg")
        fillMode: Image.PreserveAspectFit
        sourceSize.width: 48
        sourceSize.height: 48
        smooth: true
        visible: false
      }
      // Recolour the mark to the theme foreground, exactly like the shell's own icon glyphs.
      // colorization 1.0 replaces the source colour with colorizationColor, keeping the alpha
      // shape — so the mark adopts the bar's foreground and goes dark/light with the theme.
      MultiEffect {
        anchors.fill: markSrc
        source: markSrc
        colorization: 1.0
        colorizationColor: Color.foreground
      }
    }
  }
}
