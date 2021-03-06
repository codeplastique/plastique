import HttpRequest from "./HttpRequest";
import HttpResponse from "./HttpResponse";
import JsonRequestContent from "./content/JsonRequestContent";
import UrlEncodedRequestContent from "./content/UrlEncodedRequestContent";
import Serializator from "../hash/Serializator";
import SimpleMap from "../collection/impl/SimpleMap";

declare let axios;

class RestService{
    protected call<T>(req: HttpRequest): Promise<HttpResponse<T>>{
        let props: any = {
            url: req.url,
            method: req.method == null? 'GET': req.method
        };
        if(req.content != null){
            let data = req.content.data;
            if(req.content instanceof JsonRequestContent)
                props.data = typeof data == 'string'? data: Serializator.toJson(data)
            else if(req.content instanceof UrlEncodedRequestContent)
                props.data = this.encodeMap(data);
            else // FormDataRequestContent
                props.data = data;
        
            props.headers = {
                'content-type': req.content.contentType
            }
        }
        return axios(props);
    }

    private encodeMap(attrToVal: SimpleMap<string, string>): string{
        let params = [];
        attrToVal.forEach((val, paramKey) => {
            if(val != null)
                params.push(paramKey +'='+ encodeURIComponent(val));
        });
        return params.join('&');
    }

    protected buildQuery(url: string, attrToVal: SimpleMap<string, string>): string{
        return url +'?'+ this.encodeMap(attrToVal);
    }
}


export default RestService;