import { Octokit } from '@octokit/core';
import { GITHUB_API_URL, GITHUB_TOKEN as CONFIG_GITHUB_TOKEN, TARGET_ORG, GITHUB_COM_TOKEN } from './config.js';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_NO_WARNINGS = '1';

const execAsync = promisify(exec);

let GITHUB_TOKEN = process.env.GITHUB_TOKEN || CONFIG_GITHUB_TOKEN;
let argIndex = 2;

if (!GITHUB_TOKEN) {
    GITHUB_TOKEN = process.argv[2];
    argIndex = 3;
}

const [sourceOrg, sourceRepo] = process.argv.slice(argIndex);

if (!GITHUB_TOKEN || !sourceOrg || !sourceRepo) {
    console.error('Usage: node mygrater.js [GITHUB_TOKEN] <sourceOrg> <sourceRepo> [GITHUB_API_URL]');
    process.exit(1);
}

const octokit = new Octokit({
    auth: GITHUB_TOKEN,
    baseUrl: GITHUB_API_URL || 'https://api.github.com'
});

console.log("Checking pull requests in the source repository...");

let forksWithPRs = new Set();
let forks = [];
let pullRequestsMap = new Map();

async function checkPRs() {
    try {
        const { data: pullRequests } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
            owner: sourceOrg,
            repo: sourceRepo
        });
        console.log(`Found ${pullRequests.length} pull requests.`);
        
        pullRequests.forEach(pr => {
            console.log(`PR #${pr.number} from fork: ${pr.head.repo.full_name}`);
            forksWithPRs.add(pr.head.repo.full_name);

            if (!pullRequestsMap.has(pr.head.repo.full_name)) {
                pullRequestsMap.set(pr.head.repo.full_name, []);
            }
            pullRequestsMap.get(pr.head.repo.full_name).push(pr);
        });

        const { data: forksData } = await octokit.request('GET /repos/{owner}/{repo}/forks', {
            owner: sourceOrg,
            repo: sourceRepo
        });

        forks = forksData;

        console.log(`Source repository: ${sourceOrg}/${sourceRepo}`);
        console.log('Forks:');
        forks.forEach(fork => {
            const hasPR = forksWithPRs.has(fork.full_name);
            console.log(`- ${fork.full_name} ${hasPR ? '(has open PR)' : ''}`);
        });

        const deletionPromises = forks
            .filter(fork => !forksWithPRs.has(fork.full_name))
            .map(fork => deleteFork(fork.owner.login, fork.name));

        await Promise.all(deletionPromises);
    } catch (error) {
        console.error('Error checking pull requests:', error);
        throw error;
    }
}
// maybe i should consider not deleting the forks?
// if the forks are removed, they'll be removed from ghes - bad idea?
async function deleteFork(owner, repo) {
    try {
        await octokit.request('DELETE /repos/{owner}/{repo}', {
            owner,
            repo
        });
        console.log(`Deleted fork: ${owner}/${repo}`);
    } catch (error) {
        console.error(`Error deleting fork ${owner}/${repo}:`, error);
        throw error;
    }
}

async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    }));
}

async function cloneRepo(cloneUrl, repoDir) {
    if (!await fs.stat(repoDir).catch(() => false)) {
        console.log(`Cloning repository...`);
        await execAsync(`git clone ${cloneUrl} ${repoDir}`);
        console.log(`Repository cloned successfully.`);
    } else {
        console.log(`Directory ${repoDir} already exists. Skipping cloning.`);
    }
}

async function pushRefs(repoDir, refs) {
    for (const ref of refs) {
        await execAsync(`cd ${repoDir} && git push --force --no-verify origin ${ref}`);
    }
}

async function main() {
    try {
        await checkPRs();

        const answer = await askQuestion('Is it okay to begin the migration? (yes/no) ');
        if (answer.toLowerCase() !== 'yes') {
            console.log('Migration aborted.');
            process.exit(0);
        }

        console.log('Migration started...');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const sourceRepoDir = path.join(__dirname, sourceRepo);
        const cloneHost = GITHUB_API_URL ? new URL(GITHUB_API_URL).hostname : 'github.com';
        const cloneUrl = `git@${cloneHost}:${sourceOrg}/${sourceRepo}.git`;
        
        await cloneRepo(cloneUrl, sourceRepoDir);
        
        const octokitGithubCom = new Octokit({
            auth: GITHUB_COM_TOKEN
        });

        console.log(`Creating a new repository in the target organization ${TARGET_ORG} on github.com...`);
        await octokitGithubCom.request('POST /orgs/{org}/repos', {
            org: TARGET_ORG,
            name: sourceRepo,
            private: true
        });
        console.log('Repository created successfully.');
        
        await execAsync(`cd ${sourceRepoDir} && git remote set-url origin https://x-access-token:${GITHUB_COM_TOKEN}@github.com/${TARGET_ORG}/${sourceRepo}.git`);
        const { stdout: refs } = await execAsync(`cd ${sourceRepoDir} && git show-ref`);
        const refsToPush = refs.split('\n')
            .map(line => line.split(' ')[1])
            .filter(ref => ref && !ref.startsWith('refs/pull/') && ref !== 'refs/remotes/origin/HEAD');

        await pushRefs(sourceRepoDir, refsToPush);

        for (const forkWithPR of forksWithPRs) {
            const forkName = forkWithPR.split('/')[1];
            console.log(`Creating a fork of ${sourceRepo} in ${TARGET_ORG} on github.com...`);
            await octokitGithubCom.request('POST /repos/{owner}/{repo}/forks', {
                owner: TARGET_ORG,
                repo: sourceRepo,
                organization: TARGET_ORG,
                name: forkName
            });
            console.log(`Fork ${forkName} created successfully.`);
            
            console.log(`Merging ${forkName} into ${TARGET_ORG}/${forkName}...`);
            const forkDir = path.join(__dirname, forkName);
            const sourceRepoUrl = `git@${cloneHost}:${sourceOrg}/${forkName}.git`;
            const targetRepoUrl = `https://github.com/${TARGET_ORG}/${forkName}.git`;
            
            await cloneRepo(sourceRepoUrl, forkDir);
        
            await execAsync(`cd ${forkDir} && git remote add sourceRepo ${targetRepoUrl}`);
            await execAsync(`cd ${forkDir} && git fetch sourceRepo`);
            await execAsync(`cd ${forkDir} && git merge sourceRepo/main --no-edit`);
            await execAsync(`cd ${forkDir} && git remote set-url origin https://${GITHUB_COM_TOKEN}@github.com/${TARGET_ORG}/${forkName}.git`);
            // await execAsync(`cd ${forkDir} && git push --all origin`); // do we need everything?
            await execAsync(`cd ${forkDir} && git push --force origin main`);
            console.log('Fork merge completed successfully.');

            // drop a new pr here for the fork, if i need details then i can get/update the pr?
            console.log(`Creating a pull request from ${TARGET_ORG}/${forkName}:main to ${TARGET_ORG}/${sourceRepo}...`);
            const { data: pullRequest } = await octokitGithubCom.request('POST /repos/{owner}/{repo}/pulls', {
                owner: TARGET_ORG,
                repo: sourceRepo,
                title: `Merge ${forkName} into ${sourceRepo}`,
                body: 'Please pull these awesome changes in!',
                head_repo: TARGET_ORG + '/' + forkName,
                head: `main`,
                base: 'main'
            });
            console.log(`Pull request created successfully: ${pullRequest.html_url}`);
        }

     } catch (error) {
         console.error('Error in main function:', error);
         process.exit(1);
     }
 }
 
 main();