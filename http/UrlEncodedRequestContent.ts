import HttpRequestContent from "./HttpRequestContent";
import SimpleMap from "../SimpleMap";

class UrlEncodedRequestContent implements HttpRequestContent{
    public contentType = 'application/x-www-form-urlencoded'
    constructor(
        public data: SimpleMap<string | number>
    ){}
}

export default UrlEncodedRequestContent;