(() =>
{
    return (_, resources) =>
    {
        const aid = (unsafeWindow || window).aid;
        const cid = (unsafeWindow || window).cid;
        if (aid === undefined || cid === undefined)
        {
            return;
        }
        class VideoFormat
        {
            constructor(quality, internalName, displayName)
            {
                this.quality = quality;
                this.internalName = internalName;
                this.displayName = displayName;
            }
            async download()
            {
                const videoInfo = new VideoInfo(this);
                await videoInfo.fetchVideoInfo();
                videoInfo.progress = percent =>
                {
                    $(".download-progress-value").text(`${fixed(percent * 100)}`);
                    $(".download-progress-foreground").css("transform", `scaleX(${percent})`);
                };
                return videoInfo.download();
            }
            static get availableFormats()
            {
                return new Promise((resolve, reject) =>
                {
                    const url = `https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&otype=json`;
                    const xhr = new XMLHttpRequest();
                    xhr.addEventListener("load", () =>
                    {
                        const data = JSON.parse(xhr.responseText).data;
                        const qualities = data.accept_quality;
                        const internalNames = data.accept_format.split(",");
                        const displayNames = data.accept_description;
                        const formats = [];
                        while (qualities.length > 0)
                        {
                            const format = new VideoFormat(
                                qualities.pop(),
                                internalNames.pop(),
                                displayNames.pop()
                            );
                            formats.push(format);
                        }
                        resolve(formats);
                    });
                    xhr.addEventListener("error", () => reject(`获取清晰度信息失败.`));
                    xhr.withCredentials = true;
                    xhr.open("GET", url);
                    xhr.send();
                });
            }
        }
        class VideoInfoFragment
        {
            constructor(length, size, url, backupUrls)
            {
                this.length = length;
                this.size = size;
                this.url = url;
                this.backupUrls = backupUrls;
            }
        }
        class VideoInfo
        {
            constructor(format, fragments)
            {
                this.format = format;
                this.fragments = fragments || [];
                this.progress = null;
                this.loaded = 0;
                this.totalSize = null;
            }
            fetchVideoInfo()
            {
                return new Promise((resolve, reject) =>
                {
                    const url = `https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&qn=${this.format.quality}&otype=json`;
                    const xhr = new XMLHttpRequest();
                    xhr.addEventListener("load", () =>
                    {
                        const data = JSON.parse(xhr.responseText.replace(/http:/g, "https:")).data;
                        if (data.quality !== this.format.quality)
                        {
                            reject("获取下载链接失败, 请确认当前账号有下载权限后重试.");
                        }
                        const urls = data.durl;
                        this.fragments = urls.map(it => new VideoInfoFragment(
                            it.length, it.size,
                            it.url,
                            it.backup_url
                        ));
                        // if (this.fragments.length > 1)
                        // {
                        //     reject("暂不支持分段视频的下载.");
                        // }
                        resolve(this.fragments);
                    });
                    xhr.withCredentials = true;
                    xhr.open("GET", url);
                    xhr.send();
                });
            }
            downloadUrl(url)
            {
                return new Promise((resolve, reject) =>
                {
                    const xhr = new XMLHttpRequest();
                    xhr.open("GET", url);
                    xhr.responseType = "arraybuffer";
                    xhr.withCredentials = false;
                    xhr.addEventListener("progress", (e) =>
                    {
                        this.progress && this.progress((this.loaded + e.loaded) / this.totalSize);
                    });
                    xhr.addEventListener("load", () =>
                    {
                        if (xhr.status === 200)
                        {
                            resolve(xhr.response);
                        }
                        else
                        {
                            reject(`请求失败.`);
                        }
                    });
                    xhr.addEventListener("error", () =>
                    {
                        reject(`下载失败.`);
                    });
                    xhr.send();
                });
            }
            async download()
            {
                const downloadedData = [];
                this.loaded = 0;
                this.totalSize = this.fragments.map(it => it.size).reduce((acc, it) => acc + it);
                for (const fragment of this.fragments)
                {
                    const data = await this.downloadUrl(fragment.url);
                    this.loaded += fragment.size;
                    downloadedData.push(data);
                }
                if (downloadedData.length < 1)
                {
                    throw new Error("下载失败.");
                }

                let blob = null;
                let filename = null;
                const extension = fragment => (fragment || this.fragments[0]).url.indexOf(".flv") !== -1 ? ".flv" : ".mp4";
                if (downloadedData.length === 1)
                {
                    const [data] = downloadedData;
                    blob = new Blob([data], {
                        type: extension() === ".flv" ? "video/x-flv" : "video/mp4"
                    });
                    filename = document.title.replace("_哔哩哔哩 (゜-゜)つロ 干杯~-bilibili", "") + extension();
                }
                else
                {
                    const zip = new JSZip();
                    const title = document.title.replace("_哔哩哔哩 (゜-゜)つロ 干杯~-bilibili", "");
                    downloadedData.forEach((data, index) =>
                    {
                        zip.file(`${title} - ${index}${extension(this.fragments[index])}`, data);
                    });
                    blob = await zip.generateAsync({ type: "blob" });
                    filename = title + ".zip";
                }

                const blobUrl = URL.createObjectURL(blob);
                const oldBlobUrl = $("a#video-complete").attr("href");
                if (oldBlobUrl)
                {
                    URL.revokeObjectURL(oldBlobUrl);
                }
                $("a#video-complete")
                    .attr("href", blobUrl)
                    .attr("download", filename);
                this.progress && this.progress(0);
                document.getElementById("video-complete").click();
                return blobUrl;
            }
        }
        return {
            settingsWidget: {
                category: "视频与直播",
                content: resources.data.downloadVideoDom.text,
                success: () =>
                {
                    VideoFormat.availableFormats.then((formats) =>
                    {
                        formats.forEach(format =>
                        {
                            async function formatClick()
                            {
                                $(".download-video-panel")
                                    .removeClass("quality")
                                    .addClass("progress");
                                await format.download().catch(error =>
                                {
                                    $(".download-video-panel").addClass("error");
                                    $(".video-error").text(error);
                                });
                                $(".download-video-panel")
                                    .removeClass("progress")
                                    .addClass("quality");
                            }
                            $(`<li>${format.displayName}</li>`)
                                .on("click", formatClick)
                                .prependTo("ol.video-quality");
                        });
                        resources.applyStyle("downloadVideoStyle");
                        $("#download-video").on("click", () =>
                        {
                            $(".download-video-panel").toggleClass("opened");
                        }).parent().removeClass("hidden");
                    });
                    $(".video-error").on("click", () =>
                    {
                        $(".video-error").text("");
                        $(".download-video-panel")
                            .removeClass("error")
                            .removeClass("progress")
                            .addClass("quality");
                    });
                }
            }
        };
    };
})();