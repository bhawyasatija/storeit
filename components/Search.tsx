"use client";

import React, { useEffect, useRef, useState } from "react";

import Image from "next/image";
import { Input } from "@/components/ui/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getFiles } from "@/lib/actions/file.actions";
import { Models } from "node-appwrite";
import Thumbnail from "@/components/Thumbnail";
import FormattedDateTime from "@/components/FormattedDateTime";
import { useDebounce } from "use-debounce";
import { fileViewUrl } from "@/lib/file-response";
import { getTypeRoute } from "@/lib/utils";

const Search = () => {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("query") || "";
  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<Models.DefaultRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const [debouncedQuery] = useDebounce(query, 300);
  const requestId = useRef(0);

  useEffect(() => {
    const term = debouncedQuery.trim();

    if (term.length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }

    // Ignore responses that arrive after a newer search started.
    const id = ++requestId.current;
    getFiles({ types: [], searchText: term, limit: 20 })
      .then((files) => {
        if (id !== requestId.current) return;
        setResults(files.rows);
        setError(false);
        setOpen(true);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setResults([]);
        setError(true);
        setOpen(true);
      });
  }, [debouncedQuery]);

  // Clear the box when navigation removes the query from the URL.
  useEffect(() => {
    if (!searchQuery) setQuery("");
  }, [searchQuery]);

  const handleClickItem = (file: Models.DefaultRow) => {
    setOpen(false);
    setResults([]);

    router.push(
      `${getTypeRoute(file.type)}?query=${encodeURIComponent(query.trim())}`,
    );
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    if (searchQuery) router.push(path);
  };

  return (
    <div className="search">
      <div className="search-input-wrapper">
        <Image src="/assets/icons/search.svg" alt="" width={24} height={24} />
        <Input
          value={query}
          placeholder="Search..."
          aria-label="Search files"
          className="search-input"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClear();
          }}
        />

        {open && (
          <ul className="search-result" role="listbox">
            {error ? (
              <p className="empty-result">Search failed. Please try again.</p>
            ) : results.length > 0 ? (
              results.map((file) => (
                <li
                  className="flex items-center justify-between"
                  key={file.$id}
                  role="option"
                  aria-selected={false}
                  onClick={() => handleClickItem(file)}
                >
                  <div className="flex cursor-pointer items-center gap-4">
                    <Thumbnail
                      type={file.type}
                      extension={file.extension}
                      url={fileViewUrl(file.$id)}
                      className="size-9 min-w-9"
                    />
                    <p className="subtitle-2 line-clamp-1 text-light-100">
                      {file.name}
                    </p>
                  </div>

                  <FormattedDateTime
                    date={file.$createdAt}
                    className="caption line-clamp-1 text-light-200"
                  />
                </li>
              ))
            ) : (
              <p className="empty-result">No files found</p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Search;
