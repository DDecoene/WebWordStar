# Security Policy

## Reporting a vulnerability

Please report security issues privately via
[GitHub's private vulnerability reporting](https://github.com/DDecoene/WebWordStar/security/advisories/new)
— do not open a public GitHub issue for them. You'll get a reply as soon as possible,
and a fix will be released before the issue is disclosed.

## Security model

WebWordStar is **unauthenticated and private-by-URL**: a document's UUID in the URL
is its only access control. Anyone who has (or guesses) a document URL can read and
edit that document. Do not host an instance on the public internet with sensitive
content, and do not share document URLs you want to keep private.
