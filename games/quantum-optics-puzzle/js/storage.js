export class Storage {
  constructor() {
    this.ls = window.localStorage;
  }

  setLevelProgress(levelId, boardExport) {
    this.ls.setItem(
      `ftol:quantumoptics:LevelProgress ${levelId}`,
      JSON.stringify(boardExport)
    );
  }

  hasLevelProgress(levelId) {
    return this.ls.hasOwnProperty(`ftol:quantumoptics:LevelProgress ${levelId}`);
  }

  getLevelProgress(levelId) {
    const content = this.ls.getItem(`ftol:quantumoptics:LevelProgress ${levelId}`);
    if (content == null) {
      throw new Error(`No data for levelId: ${levelId}`);
    }
    return JSON.parse(this.ls.getItem(`ftol:quantumoptics:LevelProgress ${levelId}`));
  }

  setLevelIsWon(levelId, value = true) {
    this.ls.setItem(`ftol:quantumoptics:LevelIsWon ${levelId}`, String(value));
  }

  getLevelIsWon(levelId) {
    return this.ls.getItem(`ftol:quantumoptics:LevelIsWon ${levelId}`) === 'true';
  }

  setCurrentLevelId(levelId) {
    this.ls.setItem('ftol:quantumoptics:CurrentLevelId', levelId);
  }

  getCurrentLevelId() {
    return this.ls.getItem('ftol:quantumoptics:CurrentLevelId');
  }

}
