// node checkrepo.js <SOURCE_ORG>
// get a list of ghes repos and forks with pr's and then write to a csv
import { Octokit } from '@octokit/core';
import { GITHUB_TOKEN, GITHUB_API_URL } from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceOrg = process.argv[2];

if (!sourceOrg) {
    console.error('Usage: node checkrepo.js <SOURCE_ORG>');
    process.exit(1);
}

const octokit = new Octokit({
    auth: GITHUB_TOKEN,
    baseUrl: GITHUB_API_URL || 'https://api.github.com'
});

const csvFilePath = path.join(__dirname, 'repos_and_forks.csv');
const csvHeader = 'SourceRepo,ForkName\n';

fs.writeFileSync(csvFilePath, csvHeader);

async function main() {
    try {
        const { data: repos } = await octokit.request('GET /orgs/{org}/repos', {
            org: sourceOrg
        });
        console.log(`Found ${repos.length} repositories in the source organization.`);

        for (const repo of repos) {
            const sourceRepo = repo.name;
            await checkPRs(sourceRepo);
        }
    } catch (error) {
        console.error('Error checking pull requests:', error);
    }
}

async function checkPRs(repoName) {
    try {
        const { data: pullRequests } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
            owner: sourceOrg,
            repo: repoName
        });
        console.log(`Found ${pullRequests.length} pull requests in ${repoName}.`);

        const forksWithPRs = new Set();
        pullRequests.forEach(pr => {
            if (pr.head.repo.fork) {
                console.log(`PR #${pr.number} from fork: ${pr.head.repo.full_name}`);
                forksWithPRs.add(pr.head.repo.full_name);
                // Append to CSV file
                const csvLine = `${repoName},${pr.head.repo.full_name}\n`;
                fs.appendFileSync(csvFilePath, csvLine);
            }
        });

        if (forksWithPRs.size === 0) {
            console.log(`No open pull requests from forks in ${repoName}.`);
        }
    } catch (error) {
        console.error(`Error checking pull requests for ${repoName}:`, error);
    }
}

main();