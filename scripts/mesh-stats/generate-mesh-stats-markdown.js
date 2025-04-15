import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateMarkdown(stats) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const markdown = `---
title: Mesh SDK Usage Statistics
description: Current statistics and usage metrics for Mesh SDK packages
sidebarTitle: Current Stats
---

# 📊 Mesh SDK Usage Statistics
Last updated: ${currentDate}

## 👥 GitHub Organization Contributor Statistics
| Metric${'&nbsp;'.repeat(78)} |   Value |
| :---------------------------------------- | ------: |
| Total Unique Contributors in MeshJS        | ${stats.contributors.unique_count} |

## 🔍 GitHub Usage
| Repository Metric${'&nbsp;'.repeat(58)} |   Count |
| :---------------------------------------- | ------: |
| Repositories that depend on @meshsdk/core | ${stats.github.core_in_package_json} |
| Public Files containing @meshsdk/core references | ${stats.github.core_in_any_file} |

## 📦 Monthly NPM Package Downloads
| Package${'&nbsp;'.repeat(50)} |   Monthly Downloads |
| :---------------------------------------- | -----------------: |
| @meshsdk/core | ${stats.npm.downloads.last_month} |
| @meshsdk/react | ${stats.npm.react_package_downloads} |
| @meshsdk/transaction | ${stats.npm.transaction_package_downloads} |
| @meshsdk/wallet | ${stats.npm.wallet_package_downloads} |
| @meshsdk/provider | ${stats.npm.provider_package_downloads} |
| @meshsdk/core-csl | ${stats.npm.core_csl_package_downloads} |
| @meshsdk/core-cst | ${stats.npm.core_cst_package_downloads} |

## 📈 Download Statistics for @meshsdk/core
| Time Period${'&nbsp;'.repeat(49)} |   Download Count |
| :---------------------------------------- | --------------: |
| Last Week | ${stats.npm.downloads.last_week} |
| Last Month | ${stats.npm.downloads.last_month} |
| Last Year | ${stats.npm.downloads.last_year} |

## 🔗 Useful Links
- [NPM Stats Chart](${stats.urls.npm_stat_url})
- [NPM Stats Comparison](${stats.urls.npm_stat_compare_url})
`;

    return markdown;
}

export function saveMarkdown(stats) {
    const markdown = generateMarkdown(stats);
    const markdownDir = path.join('mesh-gov-updates', 'mesh-stats', 'markdown');

    // Create directory if it doesn't exist
    if (!fs.existsSync(markdownDir)) {
        fs.mkdirSync(markdownDir, { recursive: true });
    }

    const markdownPath = path.join(markdownDir, 'current.md');
    fs.writeFileSync(markdownPath, markdown);
    console.log(`Saved markdown to ${markdownPath}`);
} 