import assert from "assert";
import { Octokit } from "octokit";

import { getNumberOfGithubItemsFromPageNumbers } from "./utils";
import { GithubContributor } from "./types";

assert(process.env.GITHUB_AUTH_TOKEN, "Missing environment variable: GITHUB_AUTH_TOKEN");

const GITHUB_JOYSTREAM_ORGANIZATION_NAME = "joystream";

export class DashboardAPI {
  githubAPI: Octokit;

  constructor() {
    this.githubAPI = new Octokit({ auth: process.env.GITHUB_AUTH_TOKEN });
  }

  async fetchRepoInformation(repoName: string) {
    // TODO: The following calls can be optimized/parallelized.
    const { data: generalRepoInformation } = await this.githubAPI.request(
      "GET /repos/{username}/{repo}",
      {
        username: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
      }
    );
    const { headers: pullRequestHeaders } = await this.githubAPI.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 1,
        page: 1,
      }
    );
    const { headers: commitHeaders } = await this.githubAPI.request(
      "GET /repos/{username}/{repo}/commits",
      {
        username: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 1,
        page: 1,
      }
    );
    const { data: contributors } = await this.githubAPI.request(
      "GET /repos/{owner}/{repo}/contributors",
      {
        owner: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 5000,
      }
    );

    // TODO: Implement commit data.

    const numberOfPullRequests = getNumberOfGithubItemsFromPageNumbers(pullRequestHeaders.link);

    return {
      name: repoName,
      numberOfStars: generalRepoInformation.stargazers_count,
      numberOfCommits: getNumberOfGithubItemsFromPageNumbers(commitHeaders.link),
      numberOfOpenIssues: generalRepoInformation.open_issues_count - numberOfPullRequests,
      numberOfPullRequests,
      contributors,
    };
  }

  // TODO: Be careful of unit usage.
  // TODO: Verify correctness upon implementation.
  async getEngineeringData() {
    let totalNumberOfStars = 0;
    let totalNumberOfCommits = 0;
    // let totalNumberOfCommitsThisWeek = 0;
    let totalNumberOfOpenPRs = 0;
    let totalNumberOfOpenIssues = 0;
    const githubContributors: { [key: string]: GithubContributor } = {};

    const {
      data: { public_repos, followers },
    } = await this.githubAPI.request("GET /orgs/{org}", {
      org: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
    });

    const { data: repos } = await this.githubAPI.request("GET /orgs/{org}/repos", {
      org: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
      per_page: 1000,
    });

    const repoNames = repos.map((repo) => repo.name);

    // TODO: Optimization possible. Parallelize as much as possible.
    for (const repoName of repoNames) {
      const {
        numberOfCommits,
        numberOfOpenIssues,
        numberOfPullRequests,
        numberOfStars,
        contributors,
      } = await this.fetchRepoInformation(repoName);

      totalNumberOfStars += numberOfStars;
      totalNumberOfCommits += numberOfCommits;
      totalNumberOfOpenIssues += numberOfOpenIssues;
      totalNumberOfOpenPRs += numberOfPullRequests;

      contributors.forEach((contributor) => {
        if (contributor.login) {
          if (githubContributors[contributor.login]) {
            githubContributors[contributor.login].numberOfCommits += contributor.contributions;
          } else {
            githubContributors[contributor.login] = {
              numberOfCommits: contributor.contributions,
              id: contributor.login,
              avatar: contributor.avatar_url,
            };
          }
        }
      });
    }

    console.log(JSON.stringify(githubContributors, null, 2));

    return {
      numberOfRepositories: public_repos,
      numberOfFollowers: followers,
      numberOfStars: totalNumberOfStars,
      numberOfCommits: totalNumberOfCommits,
      numberOfOpenIssues: totalNumberOfOpenIssues,
      numberOfOpenPRs: totalNumberOfOpenPRs,
    };
  }

  async getFullData() {
    console.log("Should return full data...");
    const engineeringData = await this.getEngineeringData();

    console.log(engineeringData);
  }
}
