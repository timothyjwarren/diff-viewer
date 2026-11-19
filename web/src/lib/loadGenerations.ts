/**
 * Tracks which loads of the diff view are still the newest, so a slow, older
 * response never overwrites a newer one. Each `begin*` returns a check that
 * stays true until a newer load of the same scope starts: a full load
 * supersedes everything, a repo load supersedes earlier loads of that repo.
 */
export class LoadGenerations {
  private all = 0;
  private repos = new Map<string, number>();

  beginAll(): () => boolean {
    const gen = ++this.all;
    return () => this.all === gen;
  }

  beginRepo(repoPath: string): () => boolean {
    const all = this.all;
    const gen = (this.repos.get(repoPath) ?? 0) + 1;
    this.repos.set(repoPath, gen);
    return () => this.all === all && this.repos.get(repoPath) === gen;
  }
}
