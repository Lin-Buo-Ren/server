import getRepoName from 'helpers/getRepoName';

// provider="github"
// loggedInUser= the logged in user
// repo= Repo instance that is to be operated on (should be from `to`)
// number= PR number that is being operated on
export default function createTemporaryRepo(inst, backstrokeBotInstance, repo) {
  let [userName, repoName] = getRepoName(repo);
  let ephemeralRepoName = `fix-${userName}-${repoName}`;

  // step 0: does the repo exist?
  return inst.reposGet({user: 'backstroke-bot', repo: ephemeralRepoName}).then(exists => {
    // Repo exists, so update it instead of creating a new repo.
    return mergeChangesIntoEphemeralRepo(
      backstrokeBotInstance,
      userName, repoName, repo.branch,
      'backstroke-bot', ephemeralRepoName, repo.branch
    );
  }).catch(err => {
    if (err.code === 422) {
      // Repo doesn't exist, so create it.
      return createEphemeralRepo(backstrokeBotInstance, userName, repoName, ephemeralRepoName);
    } else {
      return Promise.reject(err);
    }
  });
}

export function createEphemeralRepo(backstrokeBotInstance, userName, repoName, ephemeralRepoName) {
  // step 1: Repo doesn't exist, so create it by forking.
  return backstrokeBotInstance.reposFork({
    user: userName,
    repo: repoName,
  }).then(newFork => {
    if (newFork) {
      // step 2: update the repo to look better / match naming conventions
      return backstrokeBotInstance.reposEdit({
        user: newFork.owner.login, repo: newFork.name,
        name: ephemeralRepoName,
        description: `A temporary backstroke repo to fix merge conflicts.`,
        homepage: `http://github.com/${userName}/${repoName}`,
        private: false,
        has_issues: false,
        has_wiki: false,
        has_downloads: false,
        auto_init: false,
      });
    } else {
      return repo;
    }
  }).then(newRepo => {
    return {
      type: 'repo',
      name: `backstroke-bot/${ephemeralRepoName}`,
      private: newRepo.private,
      provider: 'github',
      fork: true,
      branch: repo.branch,
    };
  });
}

// Merge changes into an ephemeral repo from a specified repo. Behind the scenes, this method makes
// a PR, then accepts it right away.
function mergeChangesIntoEphemeralRepo(
  inst,
  fromUser,
  fromRepo,
  fromBranch,
  ephemeralUser,
  ephemeralRepo,
  ephemeralBranch
) {
  // step 1: Create a pull request to merge in changes
  return inst.pullRequestsCreate({
    user: ephemeralUser, repo: ephemeralRepo,
    title: 'Merge in new changes from the upstream into this ephemeral snapshot',
    head: `${fromUser}:${fromBranch}`,
    base: ephemeralBranch,
  }).then(pr => {
    // step 2: Merge the pull request that was created
    return inst.pullRequestsMerge({
      user: ephemeralUser,
      repo: ephemeralRepo,
      number: pr.number,
    });
  }).then(merge => {
    // Merge was successful!
    return {
      type: 'repo',
      name: `backstroke-bot/${ephemeralRepo}`,
      private: false, // FIXME: make this dynamic.
      provider: 'github',
      fork: true,
      branch: ephemeralBranch,
    };
  }).catch(err => {
    if (err.code === 422) {
      // no new changes, keep on moving
      return {
        type: 'repo',
        name: `backstroke-bot/${ephemeralRepo}`,
        private: false, // FIXME: make this dynamic.
        provider: 'github',
        fork: true,
        branch: ephemeralBranch,
      };
    } else {
      return Promise.reject(err);
    }
  });
}
