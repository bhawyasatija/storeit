"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { sortTypes } from "@/constants";

const Sort = () => {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort");
  const value = sortTypes.some((s) => s.value === current)
    ? (current as string)
    : sortTypes[0].value;

  const handleSort = (next: string) => {
    // Keep any active search query when changing the sort order.
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", next);
    router.push(`${path}?${params.toString()}`);
  };

  return (
    <Select onValueChange={handleSort} value={value}>
      <SelectTrigger className="sort-select" aria-label="Sort files">
        <SelectValue placeholder={sortTypes[0].label} />
      </SelectTrigger>
      <SelectContent className="sort-select-content">
        {sortTypes.map((sort) => (
          <SelectItem key={sort.value} className="shad-select-item" value={sort.value}>
            {sort.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default Sort;
