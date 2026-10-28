# syntax=docker/dockerfile:1
# Agent-Fleet Worker — OpenCode 2.x bleibt das Harness (pinned, never `latest`: that tags V1!)
FROM ghcr.io/anomalyco/opencode:2.2.0

# Headless serve, state on a volume, non-root (Alpine/busybox base image)
ENV HOME=/home/opencode \
    OPENCODE_LOG_LEVEL=INFO \
    OPENCODE_PORT=4096

RUN addgroup -g 1000 opencode 2>/dev/null || true \
    && adduser -D -u 1000 -G opencode -h /home/opencode opencode 2>/dev/null || true \
    && mkdir -p /home/opencode/.config/opencode /home/opencode/.local/share/opencode \
    && chown -R opencode:opencode /home/opencode

COPY --chown=opencode:opencode opencode-bootstrap.json /home/opencode/.config/opencode/opencode.json
COPY --chown=opencode:opencode --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER opencode
WORKDIR /home/opencode
EXPOSE 4096
VOLUME ["/home/opencode/.local/share/opencode"]

# busybox wget with basic auth (username is fixed to "opencode")
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null "http://opencode:${OPENCODE_PASSWORD}@127.0.0.1:${OPENCODE_PORT}/api/info" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
