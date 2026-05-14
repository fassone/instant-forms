export type AutocompleteItem = {
  value: string;
  label: string;
  searchTerms: readonly string[];
};

const SEARCH_TERM_STOP_WORDS = new Set(["and", "of", "the"]);

export function normalizeAutocompleteText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createStateAutocompleteItems(
  states: readonly { code: string; name: string }[],
): readonly AutocompleteItem[] {
  return states.map((state) => {
    const searchTerms = new Set<string>([
      state.name,
      ...getAutocompleteLabelWords(state.name),
      ...(state.code === "DC" ? ["dc", "d c", "washington dc", "washington d c"] : []),
    ]);

    return {
      value: state.code,
      label: state.name,
      searchTerms: Array.from(searchTerms),
    };
  });
}

export function rankAutocompleteItems<TItem extends AutocompleteItem>(
  items: readonly TItem[],
  query: string,
): TItem[] {
  const normalizedQuery = normalizeAutocompleteText(query);

  if (!normalizedQuery) {
    return [];
  }

  return items
    .map((item) => {
      return {
        item,
        score: getAutocompleteMatchScore(item, normalizedQuery),
      };
    })
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => left.score - right.score || left.item.label.localeCompare(right.item.label))
    .map((result) => result.item);
}

export function getAutocompleteMatchScore(item: AutocompleteItem, normalizedQuery: string): number {
  const normalizedValue = normalizeAutocompleteText(item.value);
  const normalizedLabel = normalizeAutocompleteText(item.label);
  const normalizedTerms = item.searchTerms.map((term) => normalizeAutocompleteText(term)).filter(Boolean);

  if (normalizedValue === normalizedQuery) {
    return 0;
  }

  if (normalizedLabel === normalizedQuery) {
    return 1;
  }

  if (normalizedTerms.some((term) => term === normalizedQuery)) {
    return 2;
  }

  if (normalizedLabel.startsWith(normalizedQuery)) {
    return 3;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 4;
  }

  if (normalizedTerms.some((term) => term.startsWith(normalizedQuery))) {
    return 5;
  }

  if (normalizedLabel.includes(normalizedQuery) || normalizedTerms.some((term) => term.includes(normalizedQuery))) {
    return 6;
  }

  return Number.POSITIVE_INFINITY;
}

function getAutocompleteLabelWords(label: string): string[] {
  return normalizeAutocompleteText(label)
    .split(" ")
    .filter((word) => word.length > 1 && !SEARCH_TERM_STOP_WORDS.has(word));
}
