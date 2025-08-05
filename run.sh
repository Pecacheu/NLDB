if [ ! -f config.json ]; then
	cp config.default.json config.json
fi
docker compose up -d