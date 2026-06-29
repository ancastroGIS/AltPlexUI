#!/bin/sh
set -e
sed "s|__TOKEN__|${RD_API_KEY}|g" /app/config.yml.template > /app/config.yml
exec /app/zurg "$@"
