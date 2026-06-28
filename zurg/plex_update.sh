#!/bin/bash
# Called by Zurg whenever new content is added or removed.
# Fill in PLEX_URL (your Plex LXC IP) and PLEX_TOKEN after first setup.
#
# Find your Plex token:
#   Plex Web → any media item → ··· → Get Info → View XML
#   The token is the X-Plex-Token= value in the URL.

PLEX_URL="http://192.168.1.x:32400"
PLEX_TOKEN="YOUR_PLEX_TOKEN"

curl -s "${PLEX_URL}/library/sections/all/refresh?X-Plex-Token=${PLEX_TOKEN}" > /dev/null
