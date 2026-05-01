// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Enclav is ERC721, Ownable {
    struct ScanCertificate {
        string repoUrl;
        string scanDate;
        uint256 filesScanned;
        uint256 totalFindings;
        uint256 criticalCount;
        uint256 highCount;
        uint256 mediumCount;
        uint256 lowCount;
        string reportHash;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => ScanCertificate) private _certificates;

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string repoUrl,
        string reportHash
    );

    constructor() ERC721("Enclav Security Certificate", "ENCLAV") {}

    function mintCertificate(
        address recipient,
        string calldata repoUrl,
        string calldata scanDate,
        uint256 filesScanned,
        uint256 totalFindings,
        uint256 criticalCount,
        uint256 highCount,
        uint256 mediumCount,
        uint256 lowCount,
        string calldata reportHash
    ) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++_nextTokenId;
        _safeMint(recipient, tokenId);

        _certificates[tokenId] = ScanCertificate({
            repoUrl: repoUrl,
            scanDate: scanDate,
            filesScanned: filesScanned,
            totalFindings: totalFindings,
            criticalCount: criticalCount,
            highCount: highCount,
            mediumCount: mediumCount,
            lowCount: lowCount,
            reportHash: reportHash
        });

        emit CertificateMinted(tokenId, recipient, repoUrl, reportHash);
    }

    function getCertificate(uint256 tokenId) external view returns (ScanCertificate memory) {
        require(_ownerOf(tokenId) != address(0), "Certificate does not exist");
        return _certificates[tokenId];
    }
}
