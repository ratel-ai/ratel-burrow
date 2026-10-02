# 1. Record architecture decisions

Date: 2026-10-02

## Status

Accepted

## Context

Burrow's cross-cutting choices (what data it reads, where parsing happens, how it ships to
TypeScript and Python users) need a durable record so contributors find the *why* without
digging through chat history. Ratel's own repo keeps the same discipline.

## Decision

Use Architecture Decision Records as [described by Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Records live in `docs/adr/`, numbered sequentially (`NNNN-kebab-title.md`), with `Status`,
`Context`, `Decision`, `Consequences` (plus `Rejected` where alternatives carry signal).

The set is kept minimal and current: amend in place for small drift (paths, names, counts);
write a superseding ADR for real reversals; compact periodically. Git history is the archive.

## Consequences

A reader can load `docs/adr/` and learn every decision that still holds.
