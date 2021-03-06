import ExpressionTransformator from "./ExpressionTransformator";
import Plastique from "../const";

export default class TemplateAttribute{
    constructor(
        private elem: Element,
        private prefix: string,
        private attr: Attr,
        private expressionTransformator: ExpressionTransformator
    ){}

    getModifiers(): string[]{
        return this.getName().split('.').slice(1);
    }

    getName(): string{
        return this.attr.name.substr(this.prefix.length + 1); //+1 is :
    }

    static isTemplateAttribute(attr: Attr, prefix: string): boolean{
        return attr.name.startsWith(prefix +':');
    }

    private extractExpression(val: string): string{
        val = val.trim().replace(/\s*\n\s*/g, ' ') //remove all break lines
        let exprMatch = val.match(/[$#]\{(.+?)\}/g);
        if(exprMatch == null)
            return val;

        val = this.expressionTransformator.transformExpression(val);
        let isWithBrackets = exprMatch.length > 1;
        return val.replace(/(?<!\w)this\./g, '') //remove this.
            .replace(/#\{(.+?)(\((.+?)\))?}/g, Plastique.I18N_TEMPLATE_METHOD +"('$1',$3)") //to i18n
            .replace(/\$\{(.+?)\}/g, (isWithBrackets? '($1)': '$1')) //remove wrapper ${...}
    }

    private isPlastiqueExpression(val: string): boolean{
        return val.trim().search(/\$\{(.+?)\}/i) == 0;
    }

    transformToPlastique(): void{
        let elem = this.elem;
        let attr = this.attr;
        let modifiers = this.getModifiers();
        switch(this.getName()){
            case 'ref':
                elem.setAttribute('ref', this.extractExpression(attr.value));
                break;
            case 'slot':
                if(modifiers.length > 0 && attr.value.length > 0){
                    throw new Error(`Indefinable slot name: ${attr.name}="${attr.value}"`)
                }else if(modifiers.length == 0 && attr.value.length == 0){
                    throw new Error(`Slot without name!`)
                }
                let slotAttrName = 'v-slot:'+ (modifiers.length > 0? modifiers[0]: '['+ this.extractExpression(attr.value) +']');
                elem.setAttribute(slotAttrName, '');
                elem.setAttribute('v-hasSlot', '');
                break;
            case 'model':
                elem.setAttribute('v-model' + addModifiers(modifiers), this.extractExpression(attr.value));
                break;
            case 'text':
                let expression = this.extractExpression(attr.value)
                elem.textContent = '{{'+ expression +'}}';
                break;
            case 'if':
                elem.setAttribute('v-if', this.extractExpression(attr.value));
                break;
            case 'unless':
                elem.setAttribute('v-if', '!('+ this.extractExpression(attr.value) +')');
                break;
            case 'animation':
                return false;

            case 'attrappend':
            case 'eventappend':
                for(let dynamicAttr of attr.value.split(',')){
                    if(dynamicAttr.trim().length == 0)
                        continue;
                    let [dynAttrName, dynAttrVal] = dynamicAttr.trim().split('=');
                    dynAttrName = dynAttrName.trim();
                    if(this.isPlastiqueExpression(dynAttrName)){
                        var macrosType = attrName == 'attrappend'? '__:': '___:';
                        elem.setAttribute(macrosType + this.extractExpression(dynAttrName) + macrosType, this.extractExpression(dynAttrVal));
                    }else if(this.isPlastiqueExpression(dynAttrVal)){
                        this.handleUnknownAttrName(elem, dynAttrName, dynAttrVal);
                    }else{
                        elem.setAttribute(dynAttrName, dynAttrVal);
                    }
                }
                break;
            case 'classappend':
                elem.setAttribute('v-bind:class', this.extractExpression(attr.value));
                break;
            case 'component':
                return false;
            case 'marker':
                let componentVar = this.extractExpression(attr.value);
                elem.setAttribute('data-vcn', VirtualComponents.getId(componentVar, componentNode));
                break;
            case 'each':
                let iterateParts = attr.value.split(':');
                let leftExpr = iterateParts[0].trim();
                let rightExpr = iterateParts[1].trim();
                let isWithState = leftExpr.includes(',')? 1: 0;
                rightExpr = `$convState(${isWithState},${this.extractExpression(rightExpr)})`;
                if(isWithState){
                    let leftPartVars = leftExpr.split(',');
                    elem.insertAdjacentText('afterBegin',
                        `{{void(${leftPartVars[1]}=${leftPartVars[0]}.s,${leftPartVars[0]}=${leftPartVars[0]}.v)}}`);
                }
                elem.setAttribute('v-for', leftExpr +' in '+ rightExpr);
                break;
            default:
                this.handleUnknownAttrName();
        }
    }


    isPlastiqueTag(tagName: string): boolean{
        let t = (this.prefix + ':' + tagName).toUpperCase();
        return this.elem.tagName.startsWith(t);
    }

    hasModifiers(): boolean{
        return this.getName().includes('.');
    }

    private handleUnknownAttrName(){
        let attrVal = this.extractExpression(this.attr.value);
        let elem = this.elem;
        let name = this.getName();
        if(name == 'name' && this.isPlastiqueTag('slot')) {
            if(this.hasModifiers()) 
                throw new Error(`Slot has name modifier and name attribute: <${elem.tagName.toLowerCase()} ${this.attr.name}="...">`)
            elem.setAttribute('v-bind:name', attrVal);
        }else if(name.startsWith('on')){
            elem.setAttribute('v-on:'+ name.substr(2) + addModifiers(modifiers), attrVal);
        }else
            elem.setAttribute('v-bind:'+ name, attrVal);
    }
}