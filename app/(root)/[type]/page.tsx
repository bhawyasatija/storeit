import React from "react";
import { notFound, redirect } from "next/navigation";
import Sort from "@/components/Sort";
import { getFiles } from "@/lib/actions/file.actions";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { Models } from "node-appwrite";
import Card from "@/components/Card";
import { convertFileSize, getFileTypesParams } from "@/lib/utils";
import { getOwnerId } from "@/lib/file-access";

const Page = async ({ searchParams, params }: SearchParamProps) => {
  const type = ((await params)?.type as string) || "";
  const query = await searchParams;
  const searchText = typeof query?.query === "string" ? query.query : "";
  const sort = typeof query?.sort === "string" ? query.sort : "";

  const types = getFileTypesParams(type);
  if (!types) notFound();

  // Pages render in parallel with the layout, so check the session here too.
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const files = await getFiles({ types, searchText, sort });

  const totalSize = files.rows.reduce(
    (sum: number, file: Models.DefaultRow) => sum + (Number(file.size) || 0),
    0,
  );

  return (
    <div className="page-container">
      <section className="w-full">
        <h1 className="h1 capitalize">{type}</h1>

        <div className="total-size-section">
          <p className="body-1">
            Total: <span className="h5">{convertFileSize(totalSize)}</span>
            {searchText && (
              <span className="body-2 ml-2 text-light-200">
                matching &ldquo;{searchText}&rdquo;
              </span>
            )}
          </p>

          <div className="sort-container">
            <p className="body-1 hidden text-light-200 sm:block">Sort by:</p>

            <Sort />
          </div>
        </div>
      </section>

      {files.total > 0 ? (
        <section className="file-list">
          {files.rows.map((file: Models.DefaultRow) => (
            <Card
              key={file.$id}
              file={file}
              isOwner={getOwnerId(file) === currentUser?.$id}
            />
          ))}
        </section>
      ) : (
        <p className="empty-list">
          {searchText ? "No files match your search" : "No files uploaded"}
        </p>
      )}
    </div>
  );
};

export default Page;
