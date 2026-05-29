# SketchyBar

`cxstatusline` can feed SketchyBar through a small polling script.

```sh
sketchybar --add item cxstatusline right \
  --set cxstatusline \
  update_freq=5 \
  script='sketchybar --set "$NAME" label="$(cxstatusline render --format plain --preset compact --width 80)"'
```

For a cleaner setup, put the script in a file:

```sh
mkdir -p ~/.config/sketchybar/plugins
cat > ~/.config/sketchybar/plugins/cxstatusline.sh <<'SH'
#!/bin/sh
sketchybar --set "$NAME" label="$(cxstatusline render --format plain --preset compact --width 80)"
SH
chmod +x ~/.config/sketchybar/plugins/cxstatusline.sh
```

Then add this to your SketchyBar config:

```sh
sketchybar --add item cxstatusline right \
  --set cxstatusline \
  update_freq=5 \
  script="$HOME/.config/sketchybar/plugins/cxstatusline.sh"
```

The `plain` renderer is recommended because SketchyBar does not interpret
terminal ANSI escape codes.
