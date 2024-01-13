export const getNumberOfGithubItemsFromPageNumbers = (linkString: string | undefined) => {
  const result = linkString
    ?.split(",")[1]
    ?.match(/&page=(\d+)/g)?.[0]
    .replace(/&page=(\d+)/g, "$1");

  return result ? parseInt(result) : 0;
};
