# Dependency Security Review - 2026-09-09

## Decision

Architecture freeze is APPROVED WITH A DOCUMENTED TOOLING SECURITY EXCEPTION.

The production dependency audit currently reports four HIGH findings through the Prisma CLI dependency chain. No dependency override, forced audit fix, Prisma downgrade, or production deployment has been performed.

## Observed dependency chain

- prisma 7.10.0
- @prisma/config 7.10.0
- deepmerge-ts 7.1.5
- mysql2 3.15.3

The root project declares `prisma` as a devDependency. Application runtime database access uses Prisma Client with the Neon/PostgreSQL adapter.

## GHSA-ggr8-5vv4-36mx - deepmerge-ts

Affected installed version: 7.1.5.

Patched upstream version: 8.0.0 or later.

The vulnerability is stack exhaustion when recursive JavaScript object graphs are supplied to the merge API.

In this repository, deepmerge-ts is introduced through @prisma/config and is not imported by tracked application request-handling source. `prisma/config` is used by prisma.config.ts for Prisma CLI/configuration operations.

A forced downstream override to deepmerge-ts 8.x is intentionally not being applied during architecture freeze because @prisma/config currently pins the 7.x implementation and 8.x is a major-version change.

## mysql2 advisories

Affected installed version: 3.15.3.

The current Prisma CLI dependency tree introduces mysql2. Nairobi Club's datasource is PostgreSQL/Neon, and tracked application source does not import mysql2.

The MySQL-specific vulnerable paths are therefore not part of the intended application runtime database path.

## Risk classification

Classification: Tooling / build-time transitive dependency risk.

Application request-path exposure: Not identified.

Production database path: PostgreSQL / Neon, not MySQL.

Immediate remediation: Do not downgrade Prisma and do not run `npm audit fix --force`.

## Required follow-up

Before production sign-off:

1. Re-run `npm audit --omit=dev --audit-level=high`.
2. Check whether a newer Prisma release has upgraded @prisma/config to a patched deepmerge-ts release.
3. Check whether Prisma has upgraded its mysql2 dependency to a patched release.
4. Remove this exception when upstream versions clear the findings.
5. If the upstream findings remain at deployment time, repeat dependency reachability review against the exact production build.
6. Do not use MySQL for this application without separately resolving the mysql2 advisories.
7. Do not expose Prisma CLI/configuration execution to untrusted user input.

## Architecture-freeze conclusion

The dependency findings do not require reopening the Nairobi Club Committee Register application architecture.

Infrastructure provisioning and runtime/UAT validation may proceed.

This exception is not final production security approval and must be reviewed again immediately before deployment.