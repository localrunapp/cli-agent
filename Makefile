help:
	@echo "LocalRun Agent - Build Commands"
	@echo ""
	@echo "  make install         Install dependencies"
	@echo "  make build           Compile TypeScript"
	@echo "  make pack            Build standalone binaries (all platforms)"
	@echo "  make dev             Link for development"
	@echo "  make clean           Remove build artifacts"
	@echo ""

install:
	pnpm install

build:
	pnpm run build

pack: build
	pnpm exec oclif pack tarballs --targets darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64

dev: build
	pnpm link --global

clean:
	rm -rf dist tmp node_modules *.tgz *.tar.gz *.tar.xz oclif.manifest.json

# Release Management
release-patch:
	@$(MAKE) release type=patch

release-minor:
	@$(MAKE) release type=minor

release-major:
	@$(MAKE) release type=major

release:
	@if [ -z "$(type)" ]; then echo "Error: type argument required (patch, minor, major)"; exit 1; fi
	pnpm version $(type) --no-git-tag-version
	@VERSION=$$(node -p "require('./package.json').version"); \
	echo "Releasing v$$VERSION..."; \
	git add package.json pnpm-lock.yaml; \
	git commit -m "chore: release v$$VERSION"; \
	git tag -a v$$VERSION -m "Release v$$VERSION"; \
	git push origin main; \
	git push origin v$$VERSION; \
	if command -v gh >/dev/null 2>&1; then \
		gh release create v$$VERSION --generate-notes; \
	else \
		echo "Warning: 'gh' CLI not found. Skipping GitHub Release creation."; \
		echo "Please create the release manually: https://github.com/guillermofarias/localrun/releases/new?tag=v$$VERSION"; \
	fi