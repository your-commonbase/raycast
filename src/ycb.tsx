import { ActionPanel, Action, List, getPreferenceValues, showToast, Toast, Clipboard } from "@raycast/api";
import { useState, useCallback, useEffect } from "react";
import { instantMeiliSearch } from "@meilisearch/instant-meilisearch";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface Preferences {
  apiKey: string;
  ycbUrl: string;
}

interface SearchResult {
  id: string;
  data: string;
  metadata: {
    title?: string;
    author?: string;
    type?: string;
    ogDescription?: string;
    ogImages?: string[];
  };
  similarity?: number;
  _highlightResult?: {
    data: { value: string };
    metadata: {
      title?: { value: string };
      author?: { value: string };
    };
  };
  image?: string;
}

interface SemanticSearchResult extends SearchResult {
  similarity: number;
}

interface MeiliSearchHit extends SearchResult {
  _highlightResult: {
    data: { value: string };
    metadata: {
      title?: { value: string };
      author?: { value: string };
    };
  };
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [searchText, setSearchText] = useState("");
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [isLoadingSemanticSearch, setIsLoadingSemanticSearch] = useState(false);
  const [searchClient, setSearchClient] = useState<ReturnType<typeof instantMeiliSearch>['searchClient'] | null>(null);
  const [meiliSearchResults, setMeiliSearchResults] = useState<MeiliSearchHit[]>([]);
  const [isLoadingMeiliSearch, setIsLoadingMeiliSearch] = useState(false);

  // Helper function to get authentication token
  const getToken = async (apiKey: string): Promise<string> => {
    const response = await fetch(`${preferences.ycbUrl}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.token;
  };

  // Initialize MeiliSearch client
  useEffect(() => {
    const initializeMeiliSearch = async () => {
      try {
        const token = await getToken(preferences.apiKey);
        const { searchClient: msClient } = instantMeiliSearch(
          "https://meili-i59l.onrender.com",
          token,
          { placeholderSearch: false }
        );
        setSearchClient(msClient);
      } catch (error) {
        console.error("Failed to initialize MeiliSearch:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Search Error",
          message: "Failed to initialize search. Check your API key.",
        });
      }
    };

    if (preferences.apiKey) {
      initializeMeiliSearch();
    }
  }, [preferences.apiKey, preferences.ycbUrl]);

  // Fetch image for a given ID
  const fetchImage = async (id: string): Promise<string | undefined> => {
    try {
      const response = await fetch(`${preferences.ycbUrl}/fetchImagesByIDs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${preferences.apiKey}`,
        },
        body: JSON.stringify({
          ids: [id],
        }),
      });
      const data = await response.json();
      return data.body.urls[id];
    } catch (error) {
      console.error("Failed to fetch image:", error);
      return undefined;
    }
  };

  // Perform MeiliSearch as-you-type search
  const performMeiliSearch = useCallback(async (query: string) => {
    if (!searchClient || !query.trim()) {
      setMeiliSearchResults([]);
      return;
    }

    setIsLoadingMeiliSearch(true);
    try {
      const searchResults = await searchClient.search([
        {
          indexName: "ycb_fts_staging",
          query: query,
          params: {
            hitsPerPage: 20,
          },
        },
      ]);

      const hits = searchResults.results[0].hits as MeiliSearchHit[];
      
      // Load images for image-type results
      const resultsWithImages = await Promise.all(
        hits.map(async (hit) => {
          if (hit.metadata.type === "image") {
            const imageUrl = await fetchImage(hit.id);
            return { ...hit, image: imageUrl };
          }
          return hit;
        })
      );

      setMeiliSearchResults(resultsWithImages);
    } catch (error) {
      console.error("MeiliSearch error:", error);
      setMeiliSearchResults([]);
    } finally {
      setIsLoadingMeiliSearch(false);
    }
  }, [searchClient, preferences.apiKey, preferences.ycbUrl]);

  // Perform semantic search
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSemanticResults([]);
      return;
    }

    setIsLoadingSemanticSearch(true);
    try {
      const response = await fetch(`${preferences.ycbUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${preferences.apiKey}`,
        },
        body: JSON.stringify({
          text: query,
          matchLimit: 5,
          matchThreshold: 0.35,
        }),
      });

      if (!response.ok) {
        throw new Error("Semantic search failed");
      }

      const results = await response.json();
      
      // Load images for image-type results
      const resultsWithImages = await Promise.all(
        results.map(async (result: SemanticSearchResult) => {
          if (result.metadata.type === "image") {
            const imageUrl = await fetchImage(result.id);
            return { ...result, image: imageUrl };
          }
          return result;
        })
      );

      setSemanticResults(resultsWithImages);
    } catch (error) {
      console.error("Semantic search error:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Search Error",
        message: "Failed to perform semantic search",
      });
      setSemanticResults([]);
    } finally {
      setIsLoadingSemanticSearch(false);
    }
  }, [preferences.apiKey, preferences.ycbUrl]);

  // Handle search text changes (for as-you-type search)
  const handleSearchTextChange = useCallback((text: string) => {
    setSearchText(text);
    performMeiliSearch(text);
    
    // Clear semantic results when typing
    if (semanticResults.length > 0) {
      setSemanticResults([]);
    }
  }, [performMeiliSearch, semanticResults.length]);

  // Handle Enter key press for semantic search
  const handleEnterPress = useCallback(() => {
    if (searchText.trim()) {
      performSemanticSearch(searchText);
    }
  }, [searchText, performSemanticSearch]);


  // Get display text for metadata
  const getMetadataDisplay = (metadata: SearchResult['metadata']): string => {
    if (!metadata.author) return "";
    
    try {
      if (metadata.author.includes('yourcommonbase.com')) {
        return 'Your Commonbase';
      }
      const url = new URL(metadata.author);
      return url.hostname.replace('www.', '');
    } catch {
      if (metadata.author.includes('yourcommonbase.com')) {
        return 'Your Commonbase';
      }
      return metadata.author.length > 30 
        ? metadata.author.substring(0, 30) + '...' 
        : metadata.author;
    }
  };

  // Get entry URL
  const getEntryUrl = (id: string) => {
    const baseUrl = preferences.ycbUrl.replace('/backend', '');
    return `${baseUrl}/dashboard/entry/${id}`;
  };

  // Handle copying image to clipboard
  const handleCopyImage = async (imageUrl: string) => {
    try {
      showToast({
        style: Toast.Style.Animated,
        title: "Copying image...",
      });
      
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Get file extension from content-type or URL
      const contentType = response.headers.get('content-type') || '';
      let extension = '.jpg';
      if (contentType.includes('png')) extension = '.png';
      else if (contentType.includes('gif')) extension = '.gif';
      else if (contentType.includes('webp')) extension = '.webp';
      
      // Create temporary file
      const tempDir = mkdtempSync(join(tmpdir(), 'ycb-'));
      const tempFilePath = join(tempDir, `image${extension}`);
      writeFileSync(tempFilePath, buffer);
      
      await Clipboard.copy({
        file: tempFilePath,
      });
      
      showToast({
        style: Toast.Style.Success,
        title: "Image copied to clipboard",
      });
    } catch (error) {
      console.error('Failed to copy image:', error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to copy image",
        message: "Copying image URL instead",
      });
      await Clipboard.copy(imageUrl);
    }
  };

  return (
    <List
      isLoading={isLoadingMeiliSearch || isLoadingSemanticSearch}
      onSearchTextChange={handleSearchTextChange}
      searchBarPlaceholder="Find anything you've ever saved..."
      throttle
    >
      {semanticResults.length > 0 && (
        <List.Section title="Semantic Results" subtitle={`${semanticResults.length} semantic matches`}>
          {semanticResults.map((result) => (
            <List.Item
              key={`semantic-${result.id}`}
              title={result.metadata?.title || result.data.substring(0, 60) + "..."}
              subtitle={result.metadata?.ogDescription || result.data.substring(0, 100) + "..."}
              accessories={[
                { text: `${Math.round(result.similarity * 100)}% match` },
                ...(result.metadata?.author ? [{ text: getMetadataDisplay(result.metadata) }] : [])
              ]}
              icon={result.metadata?.ogImages?.[0] || result.image || "📄"}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.OpenInBrowser
                      title="Open Entry"
                      url={getEntryUrl(result.id)}
                    />
                    {result.metadata?.type === "image" && result.image ? (
                      <Action
                        title="Copy Image"
                        onAction={() => handleCopyImage(result.image!)}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      />
                    ) : (
                      <Action.CopyToClipboard
                        title="Copy Content"
                        content={result.data}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      />
                    )}
                    {result.metadata?.author && (
                      <>
                        <Action.CopyToClipboard
                          title="Copy Source URL"
                          content={result.metadata.author}
                          shortcut={{ modifiers: ["cmd"], key: "enter" }}
                        />
                        <Action.OpenInBrowser
                          title="Open Source"
                          url={result.metadata.author}
                          shortcut={{ modifiers: ["cmd"], key: "o" }}
                        />
                      </>
                    )}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {meiliSearchResults.length > 0 && (
        <List.Section 
          title="Search Results" 
          subtitle={`${meiliSearchResults.length} results`}
        >
          {meiliSearchResults.map((result) => (
            <List.Item
              key={`meilisearch-${result.id}`}
              title={result.metadata?.title || result.data.substring(0, 60) + "..."}
              subtitle={result.metadata?.ogDescription || result.data.substring(0, 100) + "..."}
              accessories={[
                ...(result.metadata?.author ? [{ text: getMetadataDisplay(result.metadata) }] : [])
              ]}
              icon={result.metadata?.ogImages?.[0] || result.image || "📄"}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.OpenInBrowser
                      title="Open Entry"
                      url={getEntryUrl(result.id)}
                    />
                    <Action
                      title="Semantic Search"
                      onAction={handleEnterPress}
                      shortcut={{ modifiers: ["cmd"], key: "s" }}
                    />
                    {result.metadata?.type === "image" && result.image ? (
                      <Action
                        title="Copy Image"
                        onAction={() => handleCopyImage(result.image!)}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      />
                    ) : (
                      <Action.CopyToClipboard
                        title="Copy Content"
                        content={result.data}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      />
                    )}
                    {result.metadata?.author && (
                      <>
                        <Action.CopyToClipboard
                          title="Copy Source URL"
                          content={result.metadata.author}
                          shortcut={{ modifiers: ["cmd"], key: "enter" }}
                        />
                        <Action.OpenInBrowser
                          title="Open Source"
                          url={result.metadata.author}
                          shortcut={{ modifiers: ["cmd"], key: "o" }}
                        />
                      </>
                    )}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {searchText.length === 0 && (
        <List.Section title="Getting Started">
          <List.Item
            title="Start typing to search your knowledge base"
            subtitle="Search as you type with MeiliSearch • Press Cmd+S for semantic search"
            icon="🔍"
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Dashboard"
                  url={preferences.ycbUrl.replace('/backend', '/dashboard')}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {searchText.length > 0 && meiliSearchResults.length === 0 && semanticResults.length === 0 && !isLoadingMeiliSearch && !isLoadingSemanticSearch && (
        <List.Section title="No Results">
          <List.Item
            title="No results found"
            subtitle="Try different search terms or press Cmd+S for semantic search"
            icon="❌"
            actions={
              <ActionPanel>
                <Action
                  title="Try Semantic Search"
                  onAction={handleEnterPress}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}
    </List>
  );
}