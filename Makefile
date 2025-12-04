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
	cd agent && npm install

build:
	cd agent && npm run build

pack: build
	cd agent && npx oclif pack tarballs --targets darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64

dev: build
	cd agent && npm link

clean:
	cd agent && rm -rf dist tmp node_modules *.tgz *.tar.gz *.tar.xz oclif.manifest.json