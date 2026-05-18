# `neo4j/` — context

Owns every Cypher statement the package issues. All writes go through
`@bb/neo4j`'s `runCypher` — no driver imports here.

## Schema

```
(:Knowledge {knowledgeId})
  -[:HAS_BUSINESS_CONTEXT]->
    (:BusinessContext {nodeId, knowledgeId, orgId, title, productArea, summary,
                       businessValue, technicalSummary, userImpact,
                       keywordsText, domainKeywordsText, updatedAt})
      -[:HAS_VERSION]->
        (:BusinessContextVersion {knowledgeId, nodeId, commitHash, orgId,
                                  analysisJson, updatedAt})
          -[:DESCRIBES]-> (:FileVersion {knowledgeId, commitHash, …})    [zero or more]

(:OrgKeyword {orgId, keyword, type})
  -[:APPEARS_IN_BUSINESS_CONTEXT]->
    (:BusinessContext)
```

| File                    | Responsibility                                                               |
| ----------------------- | ---------------------------------------------------------------------------- | --- | ------------------------------------- |
| `indexes.ts`            | `ensureBusinessContextIndexes()` — 7 `IF NOT EXISTS` indexes.                |
| `relationship-types.ts` | Field → relationship-class map (10 typed classes on `:OrgKeyword`).          |
| `serialize.ts`          | `string[] → "a                                                               | b   | c"` for fulltext-friendly properties. |
| `write-node.ts`         | Merges the parent `:BusinessContext` and links it from `:Knowledge`.         |
| `write-version.ts`      | Merges the per-commit `:BusinessContextVersion` and links to `:FileVersion`. |
| `write-keywords.ts`     | Merges `:OrgKeyword` nodes and `:APPEARS_IN_BUSINESS_CONTEXT` edges.         |

Every MERGE is keyed so re-runs are no-ops (idempotency is the contract).
