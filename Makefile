.PHONY: install lint test precommit

install:
	bun install

lint:
	bunx @biomejs/biome check .

lint-fix:
	bunx @biomejs/biome check --write .

test:
	bun test

precommit:
	pre-commit run -a
