# Compatibility and versioning

Packages, Grammar IR, and feature documents have separate version numbers. A
package release identifies the software; `irVersion` and `featuresVersion`
identify data contracts. Published workspace packages share one release version.

Package 1.0 stabilizes the CLI and public package APIs with Grammar IR v1 and
features v1. The initial stable documents use IR 1.4.0 and features 1.0.0. Historical
features 0.7/0.8 schemas remain in the core package. Regenerate baselines when
moving to features v1; comparisons conservatively exclude different versions.

## Grammar IR v1

Grammar IR v1 is stable. Optional, backward-compatible fields increment its minor
version. Removing or narrowing a field, changing an expression's meaning, or
changing canonical interpretation requires IR v2. Patch versions correct defects
without redefining the contract. Historical schema artifacts remain available in
the core package.

The analyzer accepts supported v1 documents and warns about future minor versions
before applying its known schema and canonical checks. A version warning does not
make an unknown field valid. Legacy v0 support follows [RFC 0001](rfcs/0001-grammar-ir-v1.md).

## Feature definitions

Every metric has an E/H classification, a comparison class, a counting definition,
and applicability conditions in the [catalog](metrics-catalog.md). A metric
definition change requires an RFC, a `featuresVersion` change, regression examples,
and a changelog entry explaining its effect on stored baselines.

Before features 1.0, compatible additions and definition changes increment the
minor version. At features 1.0 and later, optional additions increment the minor
version; removal, changed counting units, changed population, or changed meaning
requires a major version. A patch may fix an implementation to match the existing
definition; its release notes must identify affected values.

Comparisons conservatively require the same feature version. B and C metrics
also require their documented capability, representation, and source context.
Unavailable values remain unavailable; they are never replaced by zero. A schema
version match alone does not establish comparability.

## Software and Action releases

Before package 1.0, a minor release may change an API, option, or output contract;
the changelog must describe the migration. From 1.0, removals and incompatible
behavior require a major release, additions a minor release, and compatible fixes
a patch release. Node.js requirement increases require a major release after 1.0.

Use immutable version tags or commit SHAs for the Action. Create the moving `v1`
tag only when 1.0.0 is published, then advance it to tested, compatible 1.x releases.
Keep full version tags immutable. Never move a tag to repair a failed publication;
retry publishing the verified tag or issue a new patch release.
