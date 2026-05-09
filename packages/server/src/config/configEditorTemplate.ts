import { REQUIRED_KEYS } from "@bb/config";
import type { BytebellConfig } from "@bb/config";
import { CONFIG_EDITOR_STYLES } from "./configEditorStyles.ts";
import { CONFIG_EDITOR_SCRIPTS } from "./configEditorScripts.ts";

export function renderConfigEditorHtml(config: BytebellConfig): string {
  const configJson = JSON.stringify(config);
  const requiredKeys = JSON.stringify(REQUIRED_KEYS);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ByteBell | Configuration Editor</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>${CONFIG_EDITOR_STYLES}</style>
</head>
<body>
    <div class="container">
        <header>
            <h1>ByteBell</h1>
            <p class="subtitle">Configuration Environment Editor</p>
        </header>

        <form id="config-form" class="config-card">
            <div class="section">
                <div class="section-title">Core Infrastructure</div>

                <div class="field">
                    <div class="label-row">
                        <label for="mongo_uri">MongoDB URI</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <div class="input-wrapper">
                        <input type="text" id="mongo_uri" name="mongo_uri" placeholder="mongodb://localhost:27017/bytebell">
                    </div>
                    <p class="hint">Connection string for file and metadata storage.</p>
                </div>

                <div class="field">
                    <div class="label-row">
                        <label for="neo4j_uri">Neo4j URI</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <input type="text" id="neo4j_uri" name="neo4j_uri" placeholder="bolt://localhost:7687">
                </div>

                <div class="field">
                    <div class="label-row">
                        <label for="neo4j_user">Neo4j User</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <input type="text" id="neo4j_user" name="neo4j_user" placeholder="neo4j">
                </div>

                <div class="field">
                    <div class="label-row">
                        <label for="neo4j_password">Neo4j Password</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <input type="password" id="neo4j_password" name="neo4j_password" placeholder="password">
                </div>

                <div class="field">
                    <div class="label-row">
                        <label for="redis_url">Redis URL</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <input type="text" id="redis_url" name="redis_url" placeholder="redis://localhost:6379">
                </div>
            </div>

            <div class="section">
                <div class="section-title">LLM Intelligence</div>
                <div class="field">
                    <div class="label-row">
                        <label for="openrouter_api_key">OpenRouter API Key</label>
                        <span class="badge badge-required">Required</span>
                    </div>
                    <input type="password" id="openrouter_api_key" name="openrouter_api_key" placeholder="sk-or-v1-...">
                </div>
                <div class="field">
                    <div class="label-row">
                        <label for="openrouter_model">Primary Model</label>
                    </div>
                    <input type="text" id="openrouter_model" name="openrouter_model">
                </div>
            </div>

            <div class="section">
                <div class="section-title">Performance</div>
                <div class="field">
                    <div class="label-row">
                        <label for="concurrency.github">GitHub Ingestion Concurrency</label>
                    </div>
                    <input type="number" id="concurrency.github" name="concurrency.github" min="1" max="100">
                    <p class="hint">Number of parallel LLM calls for analysis.</p>
                </div>
            </div>

            <div class="actions">
                <button type="button" class="btn-secondary" onclick="window.close()">Cancel</button>
                <button type="submit" class="btn-primary">Save Configuration</button>
            </div>
        </form>
    </div>

    <div id="toast"></div>

    <script>${CONFIG_EDITOR_SCRIPTS(configJson, requiredKeys)}</script>
</body>
</html>
  `;
}
