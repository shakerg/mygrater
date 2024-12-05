import { TARGET_ORG, GITHUB_COM_TOKEN } from './config.js';
import { Octokit } from '@octokit/core';

const octokitGithubCom = new Octokit({
    auth: GITHUB_COM_TOKEN
});
// this is bs, had to google it for test, it's updated in the mygrater.js to take the envs.
async function createPullRequest() {
    try {
        const response = await octokitGithubCom.request('POST /repos/{owner}/{repo}/pulls', {
            owner: TARGET_ORG,
            repo: 'krakend',
            title: 'Amazing new feature',
            body: 'Please pull these awesome changes in!',
            head_repo: TARGET_ORG +'/krakend-bravo',
            head: 'main',
            base: 'main',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        console.log(`Pull request created: ${response.data.html_url}`);
    } catch (error) {
        console.error('Error creating pull request:', error);
    }
}

createPullRequest();