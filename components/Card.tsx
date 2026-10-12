import { Models } from "node-appwrite";
import Link from "next/link";
import Thumbnail from "@/components/Thumbnail";
import { convertFileSize, getOwnerName } from "@/lib/utils";
import FormattedDateTime from "@/components/FormattedDateTime";
import ActionDropdown from "@/components/ActionDropdown";
import { fileViewUrl } from "@/lib/file-response";

const Card = ({
  file,
  isOwner,
}: {
  file: Models.DefaultRow;
  isOwner: boolean;
}) => {
  const href = fileViewUrl(file.$id);
  const ownerName = getOwnerName(file.owner);

  // The action menu sits outside the links so opening it does not also open
  // the file in a new tab.
  return (
    <div className="file-card" data-testid="file-card">
      <div className="flex justify-between">
        <Link href={href} target="_blank" rel="noopener noreferrer" prefetch={false} aria-label={`Open ${file.name}`}>
          <Thumbnail
            type={file.type}
            extension={file.extension}
            url={href}
            className="!size-20"
            imageClassName="!size-11"
          />
        </Link>

        <div className="flex flex-col items-end justify-between">
          <ActionDropdown file={file} isOwner={isOwner} />
          <p className="body-1">{convertFileSize(file.size)}</p>
        </div>
      </div>

      <Link href={href} target="_blank" rel="noopener noreferrer" prefetch={false} className="file-card-details">
        <p className="subtitle-2 line-clamp-1 break-all">{file.name}</p>
        <FormattedDateTime
          date={file.$createdAt}
          className="body-2 text-light-100"
        />
        <p className="caption line-clamp-1 text-light-200">
          {isOwner ? "By: You" : `Shared by: ${ownerName || "another user"}`}
        </p>
      </Link>
    </div>
  );
};
export default Card;
